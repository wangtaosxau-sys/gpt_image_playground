import { readRuntimeEnv } from './runtimeEnv'

const APP_STORAGE_NAME = 'gpt-image-playground'
const STORAGE_NAMESPACE = readRuntimeEnv(import.meta.env.VITE_STORAGE_NAMESPACE)

export function getAppStorageName(): string {
  return STORAGE_NAMESPACE ? `${APP_STORAGE_NAME}.${STORAGE_NAMESPACE}` : APP_STORAGE_NAME
}

export function getStorageKey(key: string, legacyKey = `${APP_STORAGE_NAME}.${key}`): string {
  return STORAGE_NAMESPACE ? `${getAppStorageName()}.${key}` : legacyKey
}
