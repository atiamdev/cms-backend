# ATIAM College Management System - Backend

A comprehensive multi-tenant MERN stack backend for college management system.

## 🚀 Features

- **Multi-tenant Architecture**: Support for multiple branches with data isolation
- **Role-based Access Control**: SuperAdmin, Admin, Teacher, Student, Secretary roles
- **JWT Authentication**: Secure stateless authentication with refresh tokens
- **Branch Management**: Complete branch setup and configuration
- **User Management**: Comprehensive user profiles and permissions
- **Security**: Rate limiting, input validation, password hashing
- **MongoDB Integration**: Optimized schemas with proper indexing

## 📁 Project Structure

```
cms-backend/
├── config/
│   └── db.js                 # Database configuration
├── controllers/
│   ├── authController.js     # Authentication logic
│   └── branchController.js   # Branch management logic
├── middlewares/
│   ├── auth.js              # JWT authentication middleware
│   ├── branchAuth.js        # Multi-tenant authorization
│   └── errorHandler.js      # Global error handling
├── models/
│   ├── Branch.js            # Branch schema
│   └── User.js              # User schema
├── routes/
│   ├── authRoutes.js        # Authentication endpoints
│   ├── branchRoutes.js      # Branch management endpoints
│   └── [other routes]       # Additional route files
├── utils/                   # Utility functions
├── server.js               # Main server file
├── package.json            # Dependencies and scripts
└── .env.example           # Environment variables template
```

## 🛠 Installation & Setup

### Prerequisites

- Node.js (v18 or higher)
- MongoDB Atlas account or local MongoDB
- Git

### 1. Clone and Install Dependencies

```bash
cd cms-backend
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/atiam-cms

# JWT Secrets (generate strong random strings)
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-jwt-key-here

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Cloudinary (for file uploads)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 3. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 🔗 API Endpoints

### Health Check

- `GET /health` - Server health status

### Authentication

- `POST /api/auth/register` - Register new user (first user becomes superadmin)
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `PUT /api/auth/change-password` - Change password

### Branch Management (SuperAdmin only)

- `POST /api/branches` - Create new branch
- `GET /api/branches` - Get all branches
- `GET /api/branches/:id` - Get single branch
- `PUT /api/branches/:id` - Update branch
- `DELETE /api/branches/:id` - Delete branch
- `POST /api/branches/:id/academic-terms` - Add academic term
- `PUT /api/branches/:id/academic-terms/:termId/activate` - Activate academic term

## 🔐 Authentication & Authorization

### User Roles

- **SuperAdmin**: Full system access, can manage all branches
- **Admin**: Branch-level administration
- **Teacher**: Teaching and student management within branch
- **Student**: Limited access to own data
- **Secretary**: Administrative support functions

### JWT Token Structure

```json
{
  "id": "user_id",
  "iat": "issued_at",
  "exp": "expires_at"
}
```

### Multi-tenant Security

- All non-superadmin users are restricted to their branch data
- `branchId` field ensures data isolation
- Middleware validates branch access permissions

## 🗄️ Database Schema

### Users Collection

```javascript
{
  email: String (unique),
  password: String (hashed),
  firstName: String,
  lastName: String,
  roles: [String], // ['superadmin', 'admin', 'teacher', 'student', 'secretary']
  branchId: ObjectId (null for superadmin),
  status: String, // 'active', 'inactive', 'suspended', 'pending'
  profileDetails: Object,
  // ... additional fields
}
```

### Branches Collection

```javascript
{
  name: String,
  address: Object,
  contactInfo: Object,
  logoUrl: String,
  academicTerms: [Object],
  configuration: Object,
  status: String // 'active', 'inactive', 'suspended'
}
```

## 🚦 Getting Started

### 1. Create First SuperAdmin

On first run, register a user to automatically become the superadmin:

```bash
POST /api/auth/register
{
  "email": "admin@atiam.com",
  "password": "SecurePassword123",
  "firstName": "Super",
  "lastName": "Admin",
  "roles": ["superadmin"]
}
```

### 2. Create First Branch

```bash
POST /api/branches
{
  "name": "Main Campus",
  "address": {
    "street": "123 Education Street",
    "city": "Nairobi",
    "state": "Nairobi State",
    "country": "Kenya"
  },
  "contactInfo": {
    "phone": "+234-800-123-4567",
    "email": "main@atiam.com"
  }
}
```

### 3. Create Branch Users

```bash
POST /api/auth/register
{
  "email": "admin@main.atiam.com",
  "password": "SecurePassword123",
  "firstName": "Branch",
  "lastName": "Admin",
  "roles": ["admin"],
  "branchId": "branch_id_here"
}
```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests (to be implemented)

### Code Style

- Use ES6+ features
- Follow RESTful API conventions
- Implement proper error handling
- Add input validation for all endpoints
- Use meaningful commit messages

## 🛡️ Security Features

- **Password Security**: bcrypt hashing with salt rounds
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: express-validator for all inputs
- **CORS Protection**: Configured for specific frontend origins
- **Helmet**: Security headers
- **Account Lockout**: After 5 failed login attempts

## 📊 Monitoring & Logging

- Health check endpoint for uptime monitoring
- Console logging for development
- Error tracking and reporting
- Database connection status monitoring

## 🚀 Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=your-production-mongodb-uri
JWT_SECRET=your-production-jwt-secret
# ... other production variables
```

### PM2 Deployment (Recommended)

```bash
npm install -g pm2
pm2 start server.js --name "atiam-cms-backend"
pm2 save
pm2 startup
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is proprietary software for ATIAM College Management System.

## 📞 Support

For support and questions, contact the development team.

---

**Built with ❤️ for ATIAM College Management System**
