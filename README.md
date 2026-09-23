# 🎨 WBOCS Frontend Client

The frontend client for the **Web-Based Office Communication System (AMITCS)**, built with React 19, Vite 8, and Tailwind CSS v4.

---

## ⚡ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **UI Components**: [Radix UI Primitives](https://www.radix-ui.com/) & [Lucide React Icons](https://lucide.dev/)
- **Server State & Caching**: [TanStack React Query v5](https://tanstack.com/query)
- **Client State**: [Zustand v5](https://zustand-demo.pmnd.rs/)
- **Routing**: [React Router v7](https://reactrouter.com/) (Role-protected nested layouts)
- **Real-Time Client**: [Socket.io Client v4](https://socket.io/)
- **Toast Notifications**: [Sonner](https://sonner.emilkowal.ski/)
- **HTTP Client**: [Axios](https://axios-http.com/)

---

## 📁 Architecture & Features

The frontend follows a domain-driven **feature-based architecture**:

```
frontend/src/
├── components/          # Shared atomic components (Button, Modal, ProtectedRoute, etc.)
├── features/            # Modular feature domains
│   ├── announcements/   # Announcements board, targeting dialogs, reader tracking
│   ├── audit/           # Admin security audit logs table with search & filters
│   ├── auth/            # Login, password reset, session recovery
│   ├── dashboard/       # Role-specific overviews (Admin, Director, Dean, Coordinator, Staff)
│   ├── departments/     # Department listing & management
│   ├── faculties/       # Faculty listing & management
│   ├── institutes/      # Institute listing & management
│   ├── meetings/        # Meeting scheduler, attendee picks, agenda details
│   ├── memos/           # Official Electronic Memo Portal, dispatch & status lifecycles
│   ├── messages/        # Real-time chat with presence, typing indicators, read receipts
│   ├── offices/         # Administrative offices directory
│   ├── settings/        # System configuration & personal profile settings
│   ├── tasks/           # Task delegation boards with priority badges & due dates
│   └── users/           # Staff directory, avatar uploads, role administration
├── layouts/             # Role-based container layouts (AdminLayout, StaffLayout, etc.)
├── lib/                 # Axios configuration, queryClient instances
├── routes/              # Centralized route definitions & navigation guards
└── store/               # Global Zustand stores (AuthStore, SocketStore)
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file in the `frontend/` directory:
```env
VITE_API_URL=http://localhost:5000/api/v1
VITE_SOCKET_URL=http://localhost:5000
```

### 3. Start Development Server
```bash
npm run dev
```

The application will run locally at `http://localhost:5173`.

---

## 🛠️ Available Scripts

- `npm run dev`: Starts the Vite development server with Hot Module Replacement (HMR).
- `npm run build`: Compiles and bundles production-ready assets into `dist/`.
- `npm run preview`: Locally previews the production build.
- `npm run lint`: Runs ESLint across all `.js` and `.jsx` files.

---

## 🔒 Role-Based Routing

The router automatically guards routes based on authenticated user roles:
- `/admin/*`: Administrator operations (User management, organization units, audit logs, system settings)
- `/director/*`: Institutional leadership dashboard, memo portal, meetings, broadcasts
- `/dean/*`: Faculty-level dashboard, department coordination, memo portal, meetings
- `/coordinator/*`: Departmental task delegation, meetings, announcements, memo portal
- `/staff/*`: Assigned tasks, department communications, institutional announcements
