# ⚙️ WBOCS Backend API

The backend API and real-time communication engine for the **Web-Based Office Communication System (WBOCS / AMITCS)**.

WBOCS is an institutional communication and workflow platform designed around the organizational hierarchy:

```text
Institute
   │
   ├── Faculty
   │      └── Department
   │             └── Office
   │                    └── Staff
   │
   └── Administrative Offices
```

The backend provides authentication, role-based authorization, organizational management, electronic memos, task workflows, announcements, meetings, notifications, audit logging, file processing, REST APIs, and real-time communication.

> **Repository scope:** This repository contains the backend API and server-side services. The frontend application is maintained separately.

---

## ✨ Key Features

### 🔐 Authentication & Authorization

* JWT-based authentication
* Secure cookie handling
* Password hashing with bcrypt
* Password recovery via email
* Role-based access control (RBAC)
* Protected API endpoints
* Server-side permission enforcement
* Session and authentication management

### 👥 User Management

* User profiles
* Role management
* Staff directory
* Availability/status management
* Avatar upload and image processing
* Organizational relationships

### 🏢 Institutional Organization

Supports hierarchical institutional structures:

```text
Institute
   │
   ├── Faculties
   │      └── Departments
   │             └── Offices
   │
   └── Administrative Offices
```

The system supports organizational relationships between institutions, faculties, departments, offices, and staff.

### 📝 Electronic Memos

* Create and dispatch official memos
* Recipient management
* CC recipients
* Attachments
* Memo status/lifecycle tracking
* Action tracking
* Hierarchical routing

### 📋 Task Management

* Task creation
* Task delegation
* Priority management
* Due dates
* Status workflows
* Task reassignment
* Activity tracking

### 📢 Announcements

* Institution-wide announcements
* Faculty-level announcements
* Department-level announcements
* Targeted delivery
* Reader tracking
* Announcement lifecycle management

### 📅 Meetings

* Meeting creation
* Scheduling
* Agenda management
* Attendee selection
* Meeting status tracking

### 💬 Real-Time Messaging

Powered by **Socket.io**:

* Real-time messaging
* One-to-one communication
* Departmental messaging
* Online/availability status
* Typing indicators
* Read receipts
* Real-time events

### 🔔 Notifications

* In-app notifications
* Event-based notifications
* User-specific notification management

### 🔎 Audit Logging

Important system activities can be recorded through audit logs for accountability and administrative monitoring.

### 📊 Reports

The backend includes reporting functionality for system statistics and operational information.

---

## 🎯 Engineering Skills Demonstrated

This project demonstrates practical backend engineering across:

* REST API design and versioning
* Node.js and Express backend development
* Domain-oriented architecture
* MongoDB data modeling with Mongoose
* Authentication and authorization
* Role-based access control
* Business workflow implementation
* Real-time communication with Socket.io
* Request validation with Joi
* Secure file uploads and image processing
* Email-based password recovery
* Audit logging
* API documentation with OpenAPI
* Automated testing
* Environment-based configuration
* Database seeding and maintenance scripts
* Application logging
* Error handling and middleware design

---

## 🏗️ Architecture

The backend follows a modular, domain-oriented architecture.

```text
                        ┌─────────────────────┐
                        │    WBOCS Frontend   │
                        │     React + Vite     │
                        └──────────┬──────────┘
                                   │
                         REST API / Socket.io
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │      Express Server      │
                    ├──────────────────────────┤
                    │ CORS / Security          │
                    │ Rate Limiting            │
                    │ Authentication            │
                    │ Authorization / RBAC      │
                    │ Validation                │
                    │ Error Handling            │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │      Domain Modules      │
                    ├──────────────────────────┤
                    │ Auth                     │
                    │ Users                    │
                    │ Institutes                │
                    │ Faculties                │
                    │ Departments              │
                    │ Offices                  │
                    │ Memos                    │
                    │ Tasks                    │
                    │ Messages                 │
                    │ Meetings                 │
                    │ Announcements            │
                    │ Notifications            │
                    │ Audit                    │
                    │ Reports                  │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │        MongoDB           │
                    │      + Mongoose           │
                    └──────────────────────────┘
```

### Request Flow

```text
Client Request
      │
      ▼
Security Middleware
      │
      ▼
Authentication
      │
      ▼
Authorization / RBAC
      │
      ▼
Request Validation
      │
      ▼
Route
      │
      ▼
Domain Logic
      │
      ▼
Database / External Service
      │
      ▼
Response
```

---

## 🧩 Domain-Oriented Structure

Business functionality is organized by domain rather than placing all controllers, models, and logic into a single flat structure.

```text
src/
├── config/
├── constants/
├── docs/
├── middlewares/
├── modules/
│   ├── announcements/
│   ├── audit/
│   ├── auth/
│   ├── departments/
│   ├── faculties/
│   ├── institutes/
│   ├── meetings/
│   ├── memos/
│   ├── messages/
│   ├── notifications/
│   ├── offices/
│   ├── reports/
│   ├── system_configs/
│   ├── tasks/
│   └── users/
├── routes/
├── scripts/
├── services/
├── utils/
├── validators/
├── app.js
└── server.js
```

### Shared Infrastructure

* `config/` — database and environment configuration
* `constants/` — application constants and roles
* `middlewares/` — authentication, security, error handling, rate limiting
* `routes/` — API route aggregation
* `services/` — reusable application services
* `validators/` — Joi request validation schemas
* `utils/` — shared utilities and logging
* `scripts/` — database seed, migration, backfill, and integrity operations
* `docs/` — OpenAPI documentation

---

## 🛠️ Technology Stack

| Category          | Technology                       |
| ----------------- | -------------------------------- |
| Runtime           | Node.js                          |
| Framework         | Express 5                        |
| Language          | JavaScript                       |
| Database          | MongoDB                          |
| ODM               | Mongoose 9                       |
| Authentication    | JWT + secure cookies             |
| Password Security | bcryptjs                         |
| Real-Time         | Socket.io 4                      |
| Validation        | Joi                              |
| API Documentation | OpenAPI 3.0 / Swagger            |
| File Uploads      | Multer                           |
| Image Processing  | Sharp                            |
| Email             | Nodemailer                       |
| Logging           | Winston + Morgan                 |
| Security          | Helmet, CORS, Rate Limiting, HPP |
| Testing           | Vitest + Pactum                  |
| Code Quality      | ESLint + Prettier                |

---

## 🔑 Role-Based Access Control

WBOCS uses server-side role and organizational authorization.

| Role            | Organizational Scope | Example Responsibilities             |
| --------------- | -------------------- | ------------------------------------ |
| **Admin**       | System-wide          | System and administrative management |
| **Director**    | Institution          | Institution-level operations         |
| **Dean**        | Faculty              | Faculty-level operations             |
| **Coordinator** | Department           | Department-level workflow            |
| **Staff**       | Assigned scope       | Operational communication and tasks  |

The backend is the final authority for authorization.

Frontend route protection does **not** replace server-side permission checks.

---

## 🔐 Security

The backend applies multiple layers of security controls.

```text
Client
  │
  ▼
CORS
  │
  ▼
Security Headers
  │
  ▼
Rate Limiting
  │
  ▼
Authentication
  │
  ▼
Authorization / RBAC
  │
  ▼
Request Validation
  │
  ▼
Business Logic
  │
  ▼
Database
```

Security-related functionality includes:

* JWT authentication
* Secure cookie handling
* Password hashing with bcrypt
* Role-based authorization
* CORS configuration
* Helmet security headers
* Request rate limiting
* HTTP parameter pollution protection
* Request validation
* Controlled error handling
* Protected API routes
* Audit logging

Sensitive configuration values are stored in environment variables and should never be committed to the repository.

---

## 📡 API

The REST API is versioned under:

```text
/api/v1
```

### Main API Domains

```text
/api/v1/auth
/api/v1/users
/api/v1/institutes
/api/v1/faculties
/api/v1/departments
/api/v1/offices
/api/v1/memos
/api/v1/messages
/api/v1/tasks
/api/v1/announcements
/api/v1/meetings
/api/v1/audit
/api/v1/notifications
/api/v1/reports
```

### Example Endpoints

| Method  | Endpoint                             | Description                | Access           |
| ------- | ------------------------------------ | -------------------------- | ---------------- |
| `POST`  | `/api/v1/auth/login`                 | Authenticate a user        | Public           |
| `POST`  | `/api/v1/auth/forgot-password`       | Request password recovery  | Public           |
| `PATCH` | `/api/v1/auth/reset-password/:token` | Reset password             | Public           |
| `GET`   | `/api/v1/users/me`                   | Get authenticated user     | Authenticated    |
| `PATCH` | `/api/v1/users/status`               | Update availability status | Authenticated    |
| `GET`   | `/api/v1/memos`                      | List accessible memos      | Authenticated    |
| `POST`  | `/api/v1/memos`                      | Create and dispatch memo   | Authorized users |
| `GET`   | `/api/v1/tasks`                      | List accessible tasks      | Authenticated    |
| `POST`  | `/api/v1/tasks`                      | Create and assign task     | Authorized users |
| `GET`   | `/api/v1/announcements`              | List announcements         | Authenticated    |
| `GET`   | `/api/v1/meetings`                   | List meetings              | Authenticated    |
| `GET`   | `/api/v1/audit`                      | View audit records         | Admin            |

> The complete API contract is available through the Swagger/OpenAPI documentation.

---

## 📖 API Documentation

Interactive API documentation is provided using **OpenAPI 3.0 and Swagger UI**.

After starting the backend:

```text
http://localhost:5000/api-docs
```

Swagger provides:

* Available endpoints
* HTTP methods
* Request parameters
* Request bodies
* Authentication requirements
* Response schemas
* API testing

---

## 💬 Real-Time Communication

Socket.io provides real-time communication between clients and the backend.

```text
Client
   │
   │ Socket.io
   ▼
WBOCS Server
   │
   ├── Messages
   ├── Presence
   ├── Typing Events
   ├── Read Receipts
   └── Notifications
```

REST APIs are used for standard request/response operations, while Socket.io handles events that benefit from real-time communication.

---

## 🧪 Testing

Automated testing is implemented with **Vitest** and **Pactum**.

Run the test suite:

```bash
npm test
```

Testing focuses on areas such as:

* Authentication
* Authorization
* API behavior
* Validation
* Business logic
* Error handling

> The exact test coverage depends on the current test suite.

---

## 📁 Project Structure

```text
backend/
├── src/
│   ├── config/
│   ├── constants/
│   ├── docs/
│   ├── middlewares/
│   ├── modules/
│   ├── routes/
│   ├── scripts/
│   ├── services/
│   ├── utils/
│   ├── validators/
│   ├── app.js
│   └── server.js
│
├── uploads/
├── tests/
├── vitest.config.js
├── .env.example
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Requirements

Install the following before running the backend:

* Node.js
* npm
* MongoDB
* Git

---

### 1. Clone the Repository

```bash
git clone <YOUR_BACKEND_REPOSITORY_URL>
cd backend
```

---

### 2. Install Dependencies

```bash
npm install
```

---

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Configure the required environment variables.

Example:

```env
PORT=5000
NODE_ENV=development

MONGODB_URI=mongodb://localhost:27017/amitcs

JWT_SECRET=your_secure_jwt_secret
JWT_EXPIRES_IN=7d

COOKIE_SECRET=your_secure_cookie_secret

CLIENT_URL=http://localhost:5173,http://localhost:3000

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_app_password
EMAIL_FROM=noreply@example.com
```

> Never commit `.env` or production secrets to GitHub.

---

### 4. Start MongoDB

Make sure MongoDB is running and that `MONGODB_URI` points to the correct database.

---

### 5. Seed the Database

Initialize the required development data:

```bash
npm run seed
```

The seed script can initialize the required institutional structure and development administrator account.

> Change the seeded administrator credentials immediately in any shared or non-local environment.

---

### 6. Start the Development Server

```bash
npm run dev
```

The backend will normally be available at:

```text
http://localhost:5000
```

---

### 7. Production Start

```bash
npm start
```

---

## 📜 Available NPM Scripts

The current backend provides:

| Command        | Purpose                               |
| -------------- | ------------------------------------- |
| `npm run dev`  | Start development server with Nodemon |
| `npm start`    | Start the production Node.js server   |
| `npm test`     | Run Vitest tests                      |
| `npm run seed` | Seed development database             |

---

## 🌍 Environment Variables

| Variable         | Purpose                   |
| ---------------- | ------------------------- |
| `PORT`           | HTTP server port          |
| `NODE_ENV`       | Application environment   |
| `MONGODB_URI`    | MongoDB connection string |
| `JWT_SECRET`     | JWT signing secret        |
| `JWT_EXPIRES_IN` | JWT expiration period     |
| `COOKIE_SECRET`  | Cookie signing secret     |
| `CLIENT_URL`     | Allowed frontend origins  |
| `SMTP_HOST`      | SMTP server               |
| `SMTP_PORT`      | SMTP port                 |
| `SMTP_USER`      | SMTP username             |
| `SMTP_PASS`      | SMTP password             |
| `EMAIL_FROM`     | Sender email address      |

---

## 🔄 Database & Maintenance

The backend includes scripts for database-related operations such as:

* Database seeding
* Data migration
* Data backfilling
* Data integrity verification

These operations are organized under:

```text
src/scripts/
```

and the database seed entry point is:

```text
src/utils/seed.js
```

---

## 🖥️ Frontend Integration

The WBOCS frontend is maintained separately.

The frontend communicates with this backend through:

```text
REST API
Socket.io
```

Frontend repository:

```text
<YOUR_FRONTEND_REPOSITORY_URL>
```

---

## 📸 Screenshots

Add project screenshots here to demonstrate the working system.

Recommended screenshots:

1. Main dashboard
2. User/role management
3. Memo workflow
4. Task management
5. Real-time messaging
6. Swagger API documentation

Example:

```markdown
![WBOCS Dashboard](./docs/screenshots/dashboard.png)
```

---

## 🏆 Project Highlights

WBOCS demonstrates the development of a multi-domain backend system with:

```text
Authentication
      +
Authorization / RBAC
      +
Organizational Hierarchy
      +
Business Workflows
      +
REST API
      +
Real-Time Communication
      +
Validation
      +
Security
      +
Audit Logging
      +
Testing
      +
API Documentation
```

The project focuses on applying backend engineering principles to a realistic institutional communication and workflow problem rather than building isolated CRUD examples.

---

## 🚧 Project Status

**Status: Active Development**

### Implemented

* Authentication
* Role-based authorization
* Institutional organization management
* User management
* Electronic memos
* Task management
* Announcements
* Meetings
* Real-time messaging
* Notifications
* Audit logging
* API documentation
* Database seeding
* Automated testing

### In Progress

Document current unfinished features here.

### Planned

Document future improvements here.

---

## 👨‍💻 Development

Built as part of the **Arba Minch Institute of Technology Communication System (AMITCS / WBOCS)**.

The project was developed to apply practical software engineering concepts including backend architecture, API development, security, database modeling, real-time systems, and automated testing.

---

## 📄 License

This project currently uses the **ISC License** as specified in `package.json`.

If the project will be distributed publicly, add the appropriate `LICENSE` file to the repository.

---

## 🔗 Related

**Frontend:** `<YOUR_FRONTEND_REPOSITORY_URL>`

**API Documentation:** `http://localhost:5000/api-docs` (local development)

**Live Demo:** `<ADD_DEPLOYMENT_URL_IF_AVAILABLE>`

