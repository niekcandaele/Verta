import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Backend URL (server-side, so we use the Docker network name)
  const backendUrl = process.env.BACKEND_URL || 'http://app:25000';
  const adminKey = process.env.ADMIN_API_KEY || 'ikbeneenaap';
  
  // Check for Basic Auth header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Access"');
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Authentication required',
      timestamp: new Date().toISOString()
    });
  }
  
  // Validate credentials
  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');
    
    if (username !== 'admin' || password !== adminKey) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid credentials',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid authentication format',
      timestamp: new Date().toISOString()
    });
  }
  
  // Extract the path from the catch-all route
  const { path } = req.query;
  const apiPath = Array.isArray(path) ? path.join('/') : path || '';
  
  // Construct the full URL
  const url = `${backendUrl}/api/admin/${apiPath}`;
  
  console.log('Admin API Proxy:', {
    method: req.method,
    url,
    apiPath,
    authenticated: true,
  });
  
  try {
    // Remove the 'path' parameter from query since it's part of the URL
    const { path: _, ...queryParams } = req.query;
    
    // Forward the request to the backend
    const response = await axios({
      method: req.method,
      url,
      headers: {
        'X-API-KEY': adminKey,
        'Content-Type': 'application/json',
      },
      // Only include body for non-GET requests with actual content
      ...(req.method !== 'GET' && req.body && { data: req.body }),
      params: queryParams,
      // Don't throw on 4xx/5xx responses
      validateStatus: () => true,
    });
    
    // Forward the response status and data
    if (response.status === 204) {
      // No Content - don't send any body
      res.status(204).end();
    } else {
      res.status(response.status).json(response.data);
    }
  } catch (error) {
    console.error('Admin API proxy error:', error);
    
    if (axios.isAxiosError(error)) {
      // If it's an Axios error, try to forward the actual error
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else if (error.request) {
        // Request was made but no response
        res.status(503).json({
          error: 'Service Unavailable',
          message: 'Backend service is not responding',
          timestamp: new Date().toISOString(),
        });
      } else {
        // Something else happened
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to process request',
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      // Non-Axios error
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
      });
    }
  }
}