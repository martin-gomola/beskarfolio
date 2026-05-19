import axios from 'axios'
import { API_BASE_URL, API_TIMEOUT } from '../utils/constants'

// API client
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
})
