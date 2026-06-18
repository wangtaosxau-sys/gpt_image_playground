package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	defaultProxyTimeoutSeconds = 120
	maxProxyResponseBytes      = 600 * 1024 * 1024
	proxyStreamEventName       = "gpt-image-playground:proxy-stream"
)

type ProxyAPIRequest struct {
	URL            string                 `json:"url"`
	StreamID       string                 `json:"streamId,omitempty"`
	Method         string                 `json:"method"`
	Headers        map[string]string      `json:"headers"`
	BodyText       string                 `json:"bodyText"`
	BodyBase64     string                 `json:"bodyBase64"`
	FormData       []ProxyAPIFormDataPart `json:"formData"`
	TimeoutSeconds int                    `json:"timeoutSeconds"`
}

type ProxyAPIFormDataPart struct {
	Name        string `json:"name"`
	Value       string `json:"value,omitempty"`
	FileName    string `json:"fileName,omitempty"`
	ContentType string `json:"contentType,omitempty"`
	DataBase64  string `json:"dataBase64,omitempty"`
}

type ProxyAPIResponse struct {
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	Headers    map[string]string `json:"headers"`
	BodyText   string            `json:"bodyText,omitempty"`
	BodyBase64 string            `json:"bodyBase64,omitempty"`
}

type ProxyStreamStartResponse struct {
	StreamID string `json:"streamId"`
}

type ProxyStreamEvent struct {
	StreamID    string            `json:"streamId"`
	Type        string            `json:"type"`
	Status      int               `json:"status,omitempty"`
	StatusText  string            `json:"statusText,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	ChunkText   string            `json:"chunkText,omitempty"`
	ChunkBase64 string            `json:"chunkBase64,omitempty"`
	Error       string            `json:"error,omitempty"`
}

func (a *App) ProxyAPIRequest(request ProxyAPIRequest) (*ProxyAPIResponse, error) {
	return proxyAPIRequest(a.ctx, request)
}

func (a *App) StartProxyStream(request ProxyAPIRequest) (*ProxyStreamStartResponse, error) {
	streamID := strings.TrimSpace(request.StreamID)
	if streamID == "" {
		generatedID, err := createProxyStreamID()
		if err != nil {
			return nil, err
		}
		streamID = generatedID
	}

	ctx, cancel := context.WithCancel(parentContext(a.ctx))
	a.storeProxyStream(streamID, cancel)
	go func() {
		defer a.removeProxyStream(streamID)
		emit := func(event ProxyStreamEvent) {
			runtime.EventsEmit(a.ctx, proxyStreamEventName, event)
		}
		if err := proxyAPIStream(ctx, request, streamID, emit); err != nil {
			eventType := "error"
			if ctx.Err() != nil {
				eventType = "canceled"
			}
			emit(ProxyStreamEvent{
				StreamID: streamID,
				Type:     eventType,
				Error:    err.Error(),
			})
		}
	}()

	return &ProxyStreamStartResponse{StreamID: streamID}, nil
}

func (a *App) CancelProxyStream(streamID string) error {
	if cancel := a.removeProxyStream(strings.TrimSpace(streamID)); cancel != nil {
		cancel()
	}
	return nil
}

func proxyAPIRequest(parent context.Context, request ProxyAPIRequest) (*ProxyAPIResponse, error) {
	timeout := normalizeProxyTimeout(request.TimeoutSeconds)
	ctx, cancel := context.WithTimeout(parentContext(parent), timeout)
	defer cancel()

	httpRequest, err := createProxyHTTPRequest(ctx, request)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: timeout}
	response, err := client.Do(httpRequest)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	bodyBytes, err := io.ReadAll(io.LimitReader(response.Body, maxProxyResponseBytes+1))
	if err != nil {
		return nil, err
	}
	if len(bodyBytes) > maxProxyResponseBytes {
		return nil, fmt.Errorf("proxy response exceeds %d bytes", maxProxyResponseBytes)
	}

	result := &ProxyAPIResponse{
		Status:     response.StatusCode,
		StatusText: response.Status,
		Headers:    flattenProxyHeaders(response.Header),
	}
	if isTextProxyResponse(response.Header.Get("Content-Type")) {
		result.BodyText = string(bodyBytes)
	} else {
		result.BodyBase64 = base64.StdEncoding.EncodeToString(bodyBytes)
	}
	return result, nil
}

func proxyAPIStream(parent context.Context, request ProxyAPIRequest, streamID string, emit func(ProxyStreamEvent)) error {
	timeout := normalizeProxyTimeout(request.TimeoutSeconds)
	ctx, cancel := context.WithTimeout(parentContext(parent), timeout)
	defer cancel()

	httpRequest, err := createProxyHTTPRequest(ctx, request)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: timeout}
	response, err := client.Do(httpRequest)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	headers := flattenProxyHeaders(response.Header)
	emit(ProxyStreamEvent{
		StreamID:   streamID,
		Type:       "headers",
		Status:     response.StatusCode,
		StatusText: response.Status,
		Headers:    headers,
	})

	textResponse := isTextProxyResponse(response.Header.Get("Content-Type"))
	buffer := make([]byte, 32*1024)
	for {
		n, readErr := response.Body.Read(buffer)
		if n > 0 {
			chunk := buffer[:n]
			event := ProxyStreamEvent{
				StreamID: streamID,
				Type:     "chunk",
			}
			if textResponse {
				event.ChunkText = string(chunk)
			} else {
				event.ChunkBase64 = base64.StdEncoding.EncodeToString(chunk)
			}
			emit(event)
		}
		if readErr != nil {
			if readErr == io.EOF {
				emit(ProxyStreamEvent{StreamID: streamID, Type: "done"})
				return nil
			}
			return readErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
	}
}

func createProxyHTTPRequest(ctx context.Context, request ProxyAPIRequest) (*http.Request, error) {
	targetURL, err := validateProxyURL(request.URL)
	if err != nil {
		return nil, err
	}

	method := normalizeProxyMethod(request.Method)
	if method != http.MethodGet && method != http.MethodPost {
		return nil, fmt.Errorf("proxy method must be GET or POST")
	}

	body, contentType, err := buildProxyRequestBody(request)
	if err != nil {
		return nil, err
	}

	httpRequest, err := http.NewRequestWithContext(ctx, method, targetURL.String(), body)
	if err != nil {
		return nil, err
	}

	for key, value := range request.Headers {
		if shouldForwardProxyHeader(key) && strings.TrimSpace(value) != "" {
			httpRequest.Header.Set(key, value)
		}
	}
	if contentType != "" {
		httpRequest.Header.Set("Content-Type", contentType)
	}
	return httpRequest, nil
}

func parentContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func createProxyStreamID() (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", fmt.Errorf("create proxy stream id: %w", err)
	}
	return hex.EncodeToString(bytes[:]), nil
}

func (a *App) storeProxyStream(streamID string, cancel context.CancelFunc) {
	a.proxyStreamsMu.Lock()
	defer a.proxyStreamsMu.Unlock()
	if a.proxyStreams == nil {
		a.proxyStreams = map[string]context.CancelFunc{}
	}
	a.proxyStreams[streamID] = cancel
}

func (a *App) removeProxyStream(streamID string) context.CancelFunc {
	if streamID == "" {
		return nil
	}
	a.proxyStreamsMu.Lock()
	defer a.proxyStreamsMu.Unlock()
	cancel := a.proxyStreams[streamID]
	delete(a.proxyStreams, streamID)
	return cancel
}

func (a *App) cancelAllProxyStreams() {
	a.proxyStreamsMu.Lock()
	streams := a.proxyStreams
	a.proxyStreams = map[string]context.CancelFunc{}
	a.proxyStreamsMu.Unlock()

	for _, cancel := range streams {
		cancel()
	}
}

func validateProxyURL(rawURL string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return nil, fmt.Errorf("invalid proxy URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("proxy URL must use http or https")
	}
	if parsed.Host == "" {
		return nil, fmt.Errorf("proxy URL must include a host")
	}
	return parsed, nil
}

func normalizeProxyMethod(method string) string {
	normalized := strings.ToUpper(strings.TrimSpace(method))
	if normalized == "" {
		return http.MethodGet
	}
	switch normalized {
	case http.MethodGet, http.MethodPost:
		return normalized
	default:
		return normalized
	}
}

func normalizeProxyTimeout(seconds int) time.Duration {
	if seconds <= 0 {
		seconds = defaultProxyTimeoutSeconds
	}
	if seconds > 600 {
		seconds = 600
	}
	return time.Duration(seconds) * time.Second
}

func buildProxyRequestBody(request ProxyAPIRequest) (io.Reader, string, error) {
	if len(request.FormData) > 0 {
		var buffer bytes.Buffer
		writer := multipart.NewWriter(&buffer)
		for _, part := range request.FormData {
			if part.Name == "" {
				continue
			}
			if part.DataBase64 == "" {
				if err := writer.WriteField(part.Name, part.Value); err != nil {
					return nil, "", err
				}
				continue
			}

			data, err := base64.StdEncoding.DecodeString(part.DataBase64)
			if err != nil {
				return nil, "", fmt.Errorf("invalid multipart data for %q: %w", part.Name, err)
			}
			header := make(textproto.MIMEHeader)
			disposition := fmt.Sprintf(`form-data; name="%s"`, escapeMultipartQuote(part.Name))
			if part.FileName != "" {
				disposition += fmt.Sprintf(`; filename="%s"`, escapeMultipartQuote(part.FileName))
			}
			header.Set("Content-Disposition", disposition)
			if part.ContentType != "" {
				header.Set("Content-Type", part.ContentType)
			} else {
				header.Set("Content-Type", "application/octet-stream")
			}
			fileWriter, err := writer.CreatePart(header)
			if err != nil {
				return nil, "", err
			}
			if _, err := fileWriter.Write(data); err != nil {
				return nil, "", err
			}
		}
		if err := writer.Close(); err != nil {
			return nil, "", err
		}
		return &buffer, writer.FormDataContentType(), nil
	}

	if request.BodyBase64 != "" {
		data, err := base64.StdEncoding.DecodeString(request.BodyBase64)
		if err != nil {
			return nil, "", fmt.Errorf("invalid base64 body: %w", err)
		}
		return bytes.NewReader(data), "", nil
	}
	if request.BodyText != "" {
		return strings.NewReader(request.BodyText), "", nil
	}
	return nil, "", nil
}

func escapeMultipartQuote(value string) string {
	return strings.NewReplacer("\\", "\\\\", `"`, "\\\"").Replace(value)
}

func shouldForwardProxyHeader(key string) bool {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "", "host", "content-length", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade":
		return false
	default:
		return true
	}
}

func flattenProxyHeaders(header http.Header) map[string]string {
	headers := map[string]string{}
	for key, values := range header {
		if len(values) > 0 {
			headers[key] = strings.Join(values, ", ")
		}
	}
	return headers
}

func isTextProxyResponse(contentType string) bool {
	if strings.TrimSpace(contentType) == "" {
		return true
	}
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	}
	if strings.HasPrefix(mediaType, "text/") {
		return true
	}
	switch mediaType {
	case "application/json", "application/problem+json", "application/xml", "application/javascript", "application/x-ndjson", "text/event-stream":
		return true
	default:
		return strings.HasSuffix(mediaType, "+json") || strings.HasSuffix(mediaType, "+xml")
	}
}
