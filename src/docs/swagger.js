const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'AMITCS API Documentation',
    version: '1.0.0',
    description: 'API documentation for the Web-Based Office Communication System (AMITCS). Includes complete endpoints for authentication, real-time messaging, task management, and file sharing.',
    contact: {
      name: 'API Support',
    },
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Development server',
    },
  ],
  components: {
    securitySchemes: {
      // Allow testing via JWT Bearer Token OR HTTP-Only Cookies
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'jwt'
      }
    },
  },
  security: [
    {
      bearerAuth: [],
      cookieAuth: []
    },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Check server health',
        tags: ['System'],
        security: [],
        responses: {
          '200': { description: 'Server is healthy and running' }
        }
      }
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'Login user',
        tags: ['Authentication'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'admin@amit.edu.in' },
                  password: { type: 'string', example: 'password123' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Login successful, returns JWT token' },
          '401': { description: 'Invalid email or password' }
        }
      }
    },
    '/api/v1/auth/register': {
      post: {
        summary: 'Register a new user',
        tags: ['Authentication'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'John Doe' },
                  email: { type: 'string', example: 'john@amit.edu.in' },
                  password: { type: 'string', example: 'password123' },
                  passwordConfirm: { type: 'string', example: 'password123' },
                  department: { type: 'string', example: '60d0fe4f5311236168a109ca' },
                  role: { type: 'string', enum: ['staff', 'dept_head', 'hr', 'dean', 'admin'], example: 'staff' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'User created successfully' },
          '400': { description: 'Bad request data' }
        }
      }
    },
    '/api/v1/users/status': {
      patch: {
        summary: 'Update current user availability status',
        tags: ['Users'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['Available', 'Busy', 'Do Not Disturb', 'In a Meeting'], example: 'Busy' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Status updated successfully' }
        }
      }
    },
    '/api/v1/tasks': {
      post: {
        summary: 'Create a new task (Admin/Dept Head only)',
        tags: ['Tasks'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', example: 'Review Q1 Reports' },
                  description: { type: 'string', example: 'Please review all reports before Friday.' },
                  assignee: { type: 'string', example: '60d0fe4f5311236168a109cb' },
                  dueDate: { type: 'string', format: 'date-time', example: '2026-12-31T23:59:59Z' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], example: 'high' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Task created successfully' },
          '403': { description: 'Forbidden. Requires Admin or Dept Head role.' }
        }
      }
    },
    '/api/v1/announcements': {
      post: {
        summary: 'Create a new announcement with optional attachments (Admin/Dept Head only)',
        tags: ['Announcements'],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  content: { type: 'string' },
                  targetAudience: { type: 'string', enum: ['institution', 'department'] },
                  department: { type: 'string', description: 'Required only if targetAudience is department' },
                  attachments: { type: 'array', items: { type: 'string', format: 'binary' } }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Announcement created successfully' }
        }
      }
    }
  },
};

module.exports = swaggerDocument;
