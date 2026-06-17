package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProxyAPIRequestForwardsJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s", r.Method)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("authorization = %q", got)
		}
		if got := r.Header.Get("Content-Type"); got != "application/json" {
			t.Fatalf("content-type = %q", got)
		}
		body, _ := io.ReadAll(r.Body)
		if string(body) != `{"prompt":"hello"}` {
			t.Fatalf("body = %s", body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	response, err := proxyAPIRequest(context.Background(), ProxyAPIRequest{
		URL:      server.URL + "/v1/images/generations",
		Method:   "POST",
		Headers:  map[string]string{"Authorization": "Bearer test-key", "Content-Type": "application/json"},
		BodyText: `{"prompt":"hello"}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.Status != http.StatusAccepted {
		t.Fatalf("status = %d", response.Status)
	}
	if response.BodyText != `{"ok":true}` {
		t.Fatalf("body text = %q", response.BodyText)
	}
}

func TestProxyAPIRequestForwardsMultipart(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(1024 * 1024); err != nil {
			t.Fatal(err)
		}
		if got := r.FormValue("prompt"); got != "hello" {
			t.Fatalf("prompt = %q", got)
		}
		file, header, err := r.FormFile("image[]")
		if err != nil {
			t.Fatal(err)
		}
		defer file.Close()
		if header.Filename != "input.png" {
			t.Fatalf("filename = %q", header.Filename)
		}
		data, _ := io.ReadAll(file)
		if string(data) != "image-bytes" {
			t.Fatalf("file data = %q", string(data))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	response, err := proxyAPIRequest(context.Background(), ProxyAPIRequest{
		URL:    server.URL + "/v1/images/edits",
		Method: "POST",
		FormData: []ProxyAPIFormDataPart{
			{Name: "prompt", Value: "hello"},
			{
				Name:        "image[]",
				FileName:    "input.png",
				ContentType: "image/png",
				DataBase64:  base64.StdEncoding.EncodeToString([]byte("image-bytes")),
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.Status != http.StatusOK {
		t.Fatalf("status = %d", response.Status)
	}
}

func TestProxyAPIRequestRejectsUnsupportedURLSchemes(t *testing.T) {
	_, err := proxyAPIRequest(context.Background(), ProxyAPIRequest{URL: "file:///C:/secret.txt"})
	if err == nil || !strings.Contains(err.Error(), "http or https") {
		t.Fatalf("err = %v", err)
	}
}

func TestProxyAPIRequestReturnsErrorStatusBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad request", http.StatusBadRequest)
	}))
	defer server.Close()

	response, err := proxyAPIRequest(context.Background(), ProxyAPIRequest{URL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	if response.Status != http.StatusBadRequest {
		t.Fatalf("status = %d", response.Status)
	}
	if !strings.Contains(response.BodyText, "bad request") {
		t.Fatalf("body text = %q", response.BodyText)
	}
}

func TestProxyAPIRequestReturnsBinaryBodyBase64(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte{1, 2, 3})
	}))
	defer server.Close()

	response, err := proxyAPIRequest(context.Background(), ProxyAPIRequest{URL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	if response.BodyBase64 != base64.StdEncoding.EncodeToString([]byte{1, 2, 3}) {
		encoded, _ := json.Marshal(response)
		t.Fatalf("response = %s", encoded)
	}
}
