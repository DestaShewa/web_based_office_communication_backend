# WBOCS Backend API

Backend API for the **Web-Based Office Communication System (WBOCS)**, providing authentication, role-based authorization, institutional organization management, electronic memos, tasks, announcements, meetings, real-time messaging, audit logging, and other core business services.

This repository contains **only the backend API and server-side services**. The frontend application is maintained separately.

---

## 🚀 Overview

WBOCS is an institutional communication and workflow platform designed around the organizational hierarchy:

**Institute → Faculty → Department → Office → Staff**

The backend provides the APIs, authentication, authorization, business logic, database access, real-time communication, and security infrastructure required by the WBOCS frontend.

---

## ✨ Core Features

### 🔐 Authentication & Authorization

* User authentication
* JWT-based authentication
* Secure cookie-based sessions
* Password reset and recovery
* Role-based access control
* Protected API endpoints
* Permission enforcement

### 👥 User & Role Management

* User management
* Role assignment
* Staff directory
* Avatar management
* Institutional organizational relationships

Supported roles include:

* Admin
* Director
* Dean
* Coordinator
* Staff

### 🏢 Organization Management

The API supports hierarchical institutional structures:

```text
Institute
   │
   ├── Faculties
   │      │
   │      └── Departments
   │              │
   │              └── Offices
   │
   └── Administrative Offices
```

### 📝 Electronic Memo System

* Memo creation
* Memo dispatch
* Recipient management
* CC recipients
* Attachments
* Memo lifecycle/status tracking
* Action tracking
* Hierarchical routing

### 💬 Real-Time Messaging

Powered by Socket.io:

* Real-time messages
* Online presence
* Typing indicators
* Read receipts
* Real-time communication events

### 📋 Task Management

* Task creation
* Task delegation
* Priority management
* Due dates
* Status tracking
* Reassignment
* Activity/audit tracking

### 📢 Announcements

Supports targeted announcements for:

* Institution
* Faculty
* Department

Includes announcement lifecycle and reader tracking.

### 📅 Meetings

* Meeting creation
* Scheduling
* Agenda management
* Attendee selection
* Meeting status

### 🔎 Audit Logging

Administrative activities can be tracked through audit records for improved accountability and system monitoring.

---

## 🛠️ Technology Stack

| Technology      | Purpose                 |
| --------------- | ----------------------- |
| Node.js         | Runtime                 |
| Express 5       | Backend framework       |
| MongoDB         | Database                |
| Mongoose 9      | ODM                     |
| Socket.io       | Real-time communication |
| JWT             | Authentication          |
| Helmet          | Security headers        |
| Rate Limiting   | Request protection      |
| Swagger/OpenAPI | API documentation       |
| Vitest          | Testing                 |
| JavaScript      | Application language    |

---

## 📁 Project Structure

```text
backend/
├── src/
│   ├── controllers/      # Request handling
│   ├── models/           # Mongoose models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── middleware/       # Authentication, validation, security
│   ├── sockets/          # Socket.io functionality
│   ├── utils/            # Shared utilities
│   ├── config/           # Application configuration
│   └── app.js            # Express application
├── tests/                # Automated tests
├── seeders/              # Database seed data
├── .env
├── package.json
└── README.md
```

> Adjust the structure above if your actual backend folder structure differs.

---

## ⚙️ Requirements

Before running the backend, install:

* Node.js 20+
* npm
* MongoDB
* Git

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone <YOUR_BACKEND_REPOSITORY_URL>
cd backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file:

```env
PORT=5000
NODE_ENV=development

MONGODB_URI=mongodb://localhost:27017/wbocs

JWT_SECRET=your_secure_jwt_secret

FRONTEND_URL=http://localhost:5173

SOCKET_CORS_ORIGIN=http://localhost:5173
```

Use your actual project configuration and never commit secrets to Git.

---

## 🗄️ Database Setup

Make sure MongoDB is running.

Then run the project-specific database seed command if available:

```bash
npm run seed
```

The seed process can initialize:

* Administrative users
* Institutional structure
* Roles
* Initial system data

> Change the command above if your actual `package.json` uses a different seed script.

---

## ▶️ Running the Server

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

The API will normally run at:

```text
http://localhost:5000
```

---

## 📚 API Documentation

Interactive API documentation is available through Swagger/OpenAPI:

```text
http://localhost:5000/api-docs
```

The Swagger interface provides:

* Available endpoints
* Request parameters
* Request bodies
* Authentication requirements
* Response schemas
* API testing

---

## 🔗 API Structure

The API is versioned under:

```text
/api/v1
```

Example structure:

```text
/api/v1
├── /auth
├── /users
├── /institutes
├── /faculties
├── /departments
├── /offices
├── /memos
├── /messages
├── /tasks
├── /announcements
├── /meetings
├── /audit
└── /settings
```

The exact available endpoints are documented through Swagger.

---

## 🔐 Security

The backend follows a defense-in-depth approach including:

* JWT authentication
* Secure cookie handling
* Role-based authorization
* Helmet security headers
* Rate limiting
* Input validation
* XSS protection
* NoSQL injection protection
* Authentication middleware
* Authorization middleware
* Audit logging
* Controlled CORS configuration

Sensitive configuration values must be stored in environment variables.

---

## 🔑 Role-Based Access Control

The backend enforces permissions according to institutional roles.

| Role        | Scope                           |
| ----------- | ------------------------------- |
| Admin       | System-wide administration      |
| Director    | Institutional operations        |
| Dean        | Faculty-level operations        |
| Coordinator | Department-level operations     |
| Staff       | Assigned operational activities |

The backend is the final authority for authorization; frontend route protection does not replace server-side permission checks.

---

## 🔄 Real-Time Communication

Socket.io provides real-time functionality for features such as:

```text
Client
   │
   │ Socket.io
   ▼
WBOCS Server
   │
   ├── Messages
   ├── Presence
   ├── Typing Status
   └── Read Receipts
```

---

## 🧪 Testing

Run the test suite with:

```bash
npm test
```

For watch mode, if configured:

```bash
npm run test:watch
```

Testing is implemented using **Vitest**.

---

## 🧹 Code Quality

Recommended development checks:

```bash
npm run lint
```

Before creating a pull request:

```bash
npm run lint
npm test
npm run build
```

Use the commands that are actually defined in `package.json`.

---

## 🌍 Environment Configuration

Important environment variables include:

| Variable             | Purpose                  |
| -------------------- | ------------------------ |
| `PORT`               | Server port              |
| `NODE_ENV`           | Application environment  |
| `MONGODB_URI`        | MongoDB connection       |
| `JWT_SECRET`         | Authentication secret    |
| `FRONTEND_URL`       | Frontend origin          |
| `SOCKET_CORS_ORIGIN` | Socket.io allowed origin |

Never commit:

```text
.env
.env.local
.env.production
```

to the repository.

---

## 🔗 Frontend

The WBOCS frontend is maintained in a separate repository.

Frontend repository:

**[Add your frontend GitHub repository URL here]**

The frontend communicates with this backend through:

```text
REST API
Socket.io
```

---

## 🏗️ System Architecture

```text
                    ┌──────────────────┐
                    │  WBOCS Frontend  │
                    │ React + Vite     │
                    └────────┬─────────┘
                             │
                    REST API / Socket.io
                             │
                             ▼
              ┌──────────────────────────┐
              │      Express Server      │
              ├──────────────────────────┤
              │ Authentication           │
              │ Authorization / RBAC      │
              │ Business Logic            │
              │ Validation                │
              │ Security Middleware       │
              │ REST API                  │
              │ Socket.io                 │
              └────────────┬─────────────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │     MongoDB      │
                 │                  │
                 │ Users            │
                 │ Memos            │
                 │ Tasks            │
                 │ Messages         │
                 │ Meetings         │
                 │ Announcements    │
                 │ Audit Logs       │
                 └──────────────────┘
```

---

## 📌 Project Status

**Status:** Active Development

The backend is being developed as the API and server-side foundation of the WBOCS institutional communication and workflow platform.

---

## 👨‍💻 Development

Built as part of the **Arba Minch Institute of Technology Communication System (AMITCS / WBOCS)**.

---

## 📄 License

Add the project's license here when one is selected.
