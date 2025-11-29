# UBC OCPI Adaptor

An EMSP (eMobility Service Provider) OCPI server that integrates with CPO (Charge Point Operator) systems via OCPI protocol and syncs locations/tariffs to CDS (Catalog Discover Service) for UBC (Unified Bharat e-Charge) protocol discovery.

## Features

- **OCPI EMSP Server**: Full implementation of OCPI 2.2.1 EMSP modules
    - Credentials (registration and handshake)
    - Locations (receive and store from CPO)
    - Tariffs (receive and store from CPO)
    - Sessions (charging session management)
    - CDRs (Charge Detail Records)
    - Tokens (authorization)
    - Commands (START_SESSION, STOP_SESSION, etc.)

- **CDS Integration**: Sync locations and tariffs to Catalog Discover Service for UBC discovery

- **Admin API**: RESTful API for managing OCPI connections and syncing data

- **Database**: PostgreSQL with Prisma ORM for data persistence

- **Caching**: Redis for performance optimization

- **Logging**: Multi-cloud logging support (GCP, AWS, Azure)

## Prerequisites

- Node.js v22 or higher
- PostgreSQL database
- Redis server
- Docker (optional, for containerized deployment)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd ubc-ocpi-adaptor
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database:

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

5. Build the project:

```bash
npm run build
```

## Configuration

Key environment variables (see `.env.example` for full list):

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_HOST`: Redis server host
- `REDIS_PORT`: Redis server port
- `JWT_SECRET`: Secret key for JWT tokens
- `CDS_BASE_URL`: CDS API base URL
- `CDS_API_KEY`: CDS API key
- `OCPI_PARTY_ID`: Your OCPI party ID
- `OCPI_COUNTRY_CODE`: Your country code (e.g., IN)

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Docker

```bash
docker build -f docker/Dockerfile -t ubc-ocpi-adaptor .
docker run -p 3000:3000 --env-file .env ubc-ocpi-adaptor
```

## API Endpoints

### OCPI Endpoints (EMSP)

All OCPI endpoints are prefixed with `/api/ocpi/2.2.1`:

- `POST /credentials` - OCPI registration
- `PUT /locations/{location_id}` - Receive location from CPO
- `GET /locations` - List locations
- `GET /locations/{location_id}` - Get location details
- `PUT /tariffs/{tariff_id}` - Receive tariff from CPO
- `GET /tariffs` - List tariffs
- `GET /tariffs/{tariff_id}` - Get tariff details
- `POST /sessions` - Create session
- `GET /sessions` - List sessions
- `GET /sessions/{session_id}` - Get session details
- `PATCH /sessions/{session_id}` - Update session
- `POST /cdrs` - Receive CDR from CPO
- `GET /cdrs` - List CDRs
- `GET /cdrs/{cdr_id}` - Get CDR details
- `POST /tokens/{token_uid}/authorize` - Authorize token
- `POST /commands/{command}` - Handle command

### Admin Endpoints

- `POST /api/admin/auth/login` - Admin login
- `GET /api/admin/auth/me` - Get current admin user
- `POST /api/admin/ocpi/register` - Register with CPO
- `GET /api/admin/ocpi/status` - Get OCPI connection status
- `POST /api/admin/locations/fetch` - Fetch locations from CPO
- `POST /api/admin/locations/sync-to-cds` - Sync locations to CDS
- `GET /api/admin/locations` - List stored locations
- `GET /api/admin/locations/{location_id}` - Get location details
- `POST /api/admin/tariffs/fetch` - Fetch tariffs from CPO
- `POST /api/admin/tariffs/sync-to-cds` - Sync tariffs to CDS
- `GET /api/admin/tariffs` - List stored tariffs
- `GET /api/admin/tariffs/{tariff_id}` - Get tariff details

### Health Check

- `GET /api/health` - Health check endpoint

## Project Structure

```
ubc-ocpi-adaptor/
├── src/
│   ├── ocpi/              # OCPI EMSP implementation
│   │   ├── types/         # OCPI type definitions
│   │   ├── modules/       # OCPI modules
│   │   ├── validators/    # Schema validators
│   │   └── client/        # OCPI client for CPO
│   ├── cds/               # CDS integration
│   │   ├── mappers/       # OCPI to CDS mappers
│   │   └── client.ts      # CDS API client
│   ├── services/          # Business logic services
│   ├── api/               # API routes
│   │   ├── ocpi/         # OCPI endpoints
│   │   ├── admin/        # Admin endpoints
│   │   └── health/       # Health check
│   ├── config/            # Configuration
│   ├── models/            # Database models
│   └── utils/            # Utility functions
├── prisma/                # Prisma schema and migrations
├── docker/                # Docker files
└── tests/                 # Test files
```

## Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Database Migrations

```bash
# Create a new migration
npm run prisma:migrate

# Open Prisma Studio
npm run prisma:studio
```

## License

ISC
