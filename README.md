# Wallpaper10

> **Any wallpaper. Perfect size.**
> **4K quality. Under 10 MB.**

A production-ready SaaS for wallpaper optimization and discovery. Upload any image or paste a URL, select a target file size (1 MB, 5 MB, 10 MB, or custom), and receive the highest-quality optimized version possible within that limit.

## Features

### Core Optimizer
- **Drag & drop upload** with image preview and analysis
- **URL optimization** with SSRF protection
- **Smart compression algorithm** using binary search to hit exact target sizes
- **Multiple formats**: WebP, AVIF, JPEG, PNG (auto-recommended)
- **Resolution presets**: Original, 4K, 2K, 1080p, Custom
- **Before/after comparison**: Side-by-side, slider, stacked (mobile)
- **Instant download** with optimized filename

### Wallpaper Library
- **Masonry grid** with lazy loading
- **Category filtering** (4K, Anime, Gaming, Nature, Cars, Space, Minimal, Abstract, Cyberpunk, Architecture, Mobile, Ultrawide)
- **SEO-optimized detail pages** with OpenGraph, Twitter cards, structured data
- **Download tracking** and view counts

### User Accounts
- **Email/password authentication** with JWT
- **Supabase OAuth** (Google) ready
- **Free tier**: 5 optimizations/day, 25 MB max input, 10 MB max output
- **Pro tier architecture**: Unlimited, 100 MB input, batch processing, priority queue
- **Optimization history** with compression stats

### Admin Dashboard
- **Overview stats**: Users, optimizations, downloads, storage, daily activity
- **User management**: Plan changes, disable/enable, search, pagination
- **Wallpaper management**: CRUD, publish/unpublish, category assignment
- **Analytics**: Daily trends, popular wallpapers, compression ratios

### Technical
- **PWA support**: Installable, offline shell caching
- **Responsive design**: Mobile-first, works on all screen sizes
- **Accessibility**: Semantic HTML, keyboard navigation, ARIA labels, reduced motion
- **Security**: Rate limiting, SSRF protection, file validation, decompression bomb protection
- **Performance**: Lazy loading, optimized thumbnails, database indexes, efficient queries

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Python 3.11+, Flask, Pillow |
| Database | PostgreSQL (Supabase compatible) |
| Auth | JWT + Supabase Auth |
| Storage | Local (dev), Supabase/S3 (prod) |
| Deployment | Replit-ready, Gunicorn for production |

## Project Structure

```
x/
├── frontend/                 # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ui/           # Button, Input, Card, Badge, Select
│   │   │   ├── optimizer/    # UploadArea, UrlInput, Controls, Comparison
│   │   │   └── admin/        # AdminLayout
│   │   ├── pages/            # Home, Optimizer, Wallpapers, WallpaperDetail, Login, Register, AdminDashboard
│   │   ├── hooks/            # useAuth
│   │   ├── services/         # API client
│   │   ├── types/            # TypeScript types
│   │   ├── utils/            # Helpers (cn, format)
│   │   ├── styles/           # Global CSS
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/               # Static assets, manifest, sw.js
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── backend/                  # Flask API
│   ├── app/
│   │   ├── routes/           # optimize, auth, wallpapers, admin
│   │   ├── services/         # image_optimizer, url_fetcher, database, auth
│   │   ├── models/           # Data classes, enums
│   │   ├── utils/            # Helpers
│   │   └── config.py         # Configuration
│   ├── tests/
│   ├── app.py
│   └── requirements.txt
│
├── database/
│   └── schema.sql            # PostgreSQL schema
│
├── .env.example
└── README.md
```

## Prerequisites

- **Node.js** 18+
- **Python** 3.11+
- **PostgreSQL** 14+ (or Supabase project)
- **pnpm** (recommended) or npm

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/x.git
cd x

# Frontend
cd frontend
pnpm install

# Backend
cd ../backend
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

Required variables:
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/x
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SECRET_KEY=your-secret-key
JWT_SECRET=your-jwt-secret
```

### 3. Initialize Database

```bash
# Run schema against your PostgreSQL database
psql -d x -f database/schema.sql
```

### 4. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
python app.py
# Runs on http://localhost:5000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
pnpm dev
# Runs on http://localhost:5173
```

Visit `http://localhost:5173` to use the app.

## Production Deployment

### Backend (Gunicorn)

```bash
cd backend
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Frontend (Static Build)

```bash
cd frontend
pnpm build
# Output in frontend/dist/
# Serve with nginx or any static host
```

### Environment Variables for Production

```env
ENV=production
DEBUG=false
SECRET_KEY=strong-random-secret
JWT_SECRET=strong-random-jwt-secret
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
STORAGE_TYPE=supabase  # or s3
STORAGE_BUCKET=wallpapers
CORS_ORIGINS=https://yourdomain.com
```

### Docker (Optional)

```dockerfile
# Backend
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ .
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]

# Frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY frontend/ .
RUN npm install && npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

## Replit Setup

1. Create a new Repl with Python template
2. Add PostgreSQL database from Replit Database tab
3. Set environment variables in Secrets tab
4. Run `pip install -r backend/requirements.txt`
5. Run `cd frontend && npm install && npm run build`
6. Configure `.replit` to run backend and serve frontend static files

## API Endpoints

### Authentication
```
POST   /api/auth/register       # Register new user
POST   /api/auth/login          # Login
POST   /api/auth/supabase       # Supabase OAuth
GET    /api/auth/me             # Get current user
POST   /api/auth/refresh        # Refresh token
```

### Optimization
```
POST   /api/optimize/analyze    # Analyze uploaded image
POST   /api/optimize/optimize   # Optimize uploaded image
POST   /api/optimize/optimize-url  # Optimize from URL
GET    /api/optimize/history    # User's optimization history
GET    /api/optimize/limits     # Current plan limits
```

### Wallpapers
```
GET    /api/wallpapers          # List wallpapers (paginated, filtered)
GET    /api/wallpapers/categories  # List categories with counts
GET    /api/wallpapers/:slug    # Get wallpaper detail
POST   /api/wallpapers/:id/download  # Track download
```

### Admin (requires admin role)
```
GET    /api/admin/stats         # Dashboard stats
GET    /api/admin/analytics     # Daily stats + popular wallpapers
GET    /api/admin/users         # List users (paginated, searchable)
PUT    /api/admin/users/:id/plan  # Change user plan
POST   /api/admin/users/:id/disable  # Disable user
GET    /api/admin/wallpapers    # List all wallpapers (admin)
POST   /api/admin/wallpapers    # Create wallpaper
PUT    /api/admin/wallpapers/:id  # Update wallpaper
DELETE /api/admin/wallpapers/:id  # Delete wallpaper
```

## Configuration

### Plan Limits (backend/app/config.py)

```python
FREE_LIMITS = PlanLimits(
    max_input_mb=25,
    max_output_mb=10,
    daily_optimizations=5,
    history_retention_days=7
)

PRO_LIMITS = PlanLimits(
    max_input_mb=100,
    max_output_mb=50,
    daily_optimizations=-1,  # unlimited
    priority_processing=True,
    batch_processing=True,
    no_ads=True,
    history_retention_days=365
)
```

### Image Processing Limits

```python
MAX_UPLOAD_SIZE_MB = 50
MAX_OUTPUT_SIZE_MB = 10
MAX_PIXELS = 8_294_400  # 4K = 3840×2160
```

## Security Considerations

- **File validation**: MIME type, magic bytes, extension, size, pixel limits
- **SSRF protection**: Blocks localhost, private IPs, metadata endpoints, cloud endpoints
- **Rate limiting**: Per-IP and per-user limits (configurable)
- **Temporary files**: Auto-cleanup after processing
- **No permanent storage** of user uploads by default
- **JWT tokens** with 30-day expiry, refresh endpoint
- **CORS** restricted to configured origins
- **Admin routes** protected by role check on every request

## Testing

### Backend Tests

```bash
cd backend
pytest tests/ -v
```

Key test scenarios:
- Valid image upload and optimization
- Oversized file rejection
- Malformed/corrupted image handling
- Target size achievement (within 5%)
- URL validation and SSRF blocking
- Rate limiting enforcement
- Authentication and authorization

### Frontend Tests

```bash
cd frontend
npm run test
# or
npm run test:watch
```

## Future Roadmap

- [ ] Stripe/Razorpay integration for Pro subscriptions
- [ ] Batch optimization API
- [ ] AI wallpaper generation (Stable Diffusion)
- [ ] AI upscaling (Real-ESRGAN)
- [ ] Smart cropping for device-specific ratios
- [ ] Browser-side compression (WebAssembly)
- [ ] Developer API with API keys
- [ ] Affiliate/referral program
- [ ] Wallpaper collections/playlists
- [ ] Social features (likes, comments, shares)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: GitHub Issues
- **Discord**: discord.gg/x
- **Email**: support@x.com

---

Built with ❤️ for wallpaper enthusiasts everywhere.