<p align="center">
  <h1 align="center">🎮 4Fun Store — Backend API</h1>
  <p align="center">
    REST API para marketplace de videojuegos físicos y digitales.<br/>
    Desarrollado como proyecto de tesis — <strong>Mariano Martinez</strong>.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-4.18-000000?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white" alt="MongoDB">
  <img src="https://img.shields.io/badge/JWT-Auth-000000?logo=jsonwebtokens&logoColor=white" alt="JWT">
  <img src="https://img.shields.io/badge/MercadoPago-Payments-00B1EA?logo=mercadopago&logoColor=white" alt="MercadoPago">
</p>

---

## 📋 Tabla de Contenido

- [Descripción](#-descripción)
- [Arquitectura](#-arquitectura)
- [Tech Stack](#-tech-stack)
- [Instalación](#-instalación)
- [Variables de Entorno](#-variables-de-entorno)
- [API Endpoints](#-api-endpoints)
- [Modelos de Datos](#-modelos-de-datos)
- [Seguridad](#-seguridad)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Frontend](#-frontend)

---

## 📖 Descripción

**4Fun Store** es una plataforma e-commerce completa diseñada para la compra y venta de videojuegos, tanto en formato físico como digital (keys). El backend expone una API REST que soporta:

- 🛒 **Catálogo de productos** con filtrado por plataforma, género, precio y tipo
- 🔑 **Entrega de keys digitales** automática tras la compra
- 💳 **Pagos seguros** mediante integración con MercadoPago
- 👤 **Gestión de usuarios** con registro, login y verificación de email
- ❤️ **Wishlist** y carrito de compras persistente
- ⭐ **Sistema de reseñas** con calificaciones
- 🎟️ **Cupones de descuento** con validación
- 📊 **Dashboard administrativo** con métricas y gestión de órdenes
- 📧 **Emails transaccionales** vía Nodemailer (confirmaciones, bienvenida, etc.)

---

## 🏗 Arquitectura

El proyecto sigue una arquitectura **MVC + Services** (separación de responsabilidades):

```
Proyecto-Back/
├── config/          # Configuración de DB y CORS
├── controllers/     # Controladores de rutas (request/response)
├── middlewares/     # Auth JWT, validación, manejo de errores
├── models/          # Esquemas Mongoose (MongoDB)
├── routes/          # Definición de rutas Express
├── services/        # Lógica de negocio
├── utils/           # Logger (Winston), constantes, helpers
├── scripts/         # Scripts utilitarios
├── tests/           # Tests unitarios con Jest
├── docs/            # Documentación interna
└── server.js        # Punto de entrada
```

**Flujo de una request:**

```
Request → Route → Middleware (Auth/Validation) → Controller → Service → Model → DB
```

---

## 🛠 Tech Stack

| Categoría        | Tecnología                                                        |
|------------------|-------------------------------------------------------------------|
| Runtime          | Node.js 18+                                                      |
| Framework        | Express 4.18                                                     |
| Base de Datos    | MongoDB Atlas (Mongoose 7.6)                                     |
| Autenticación    | JWT (jsonwebtoken) + bcryptjs                                    |
| Pagos            | MercadoPago SDK v2                                               |
| Email            | Nodemailer (SMTP Gmail)                                          |
| Validación       | express-validator                                                |
| Seguridad        | Helmet, express-rate-limit, express-mongo-sanitize, hpp, CORS    |
| Logging          | Winston                                                          |
| Compresión       | compression                                                      |
| Testing          | Jest + node-mocks-http                                           |
| Dev Tools        | Nodemon, ngrok (tunelización dev)                                |

---

## 🚀 Instalación

### Prerrequisitos

- Node.js ≥ 18
- npm o yarn
- Cuenta en [MongoDB Atlas](https://www.mongodb.com/atlas) (o instancia local)
- Credenciales de [MercadoPago](https://www.mercadopago.com.ar/developers)
- Cuenta Gmail con [App Password](https://myaccount.google.com/apppasswords) para emails

### Setup

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd Proyecto-Back

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales (ver sección siguiente)

# 4. Iniciar en modo desarrollo
npm run dev

# El servidor estará disponible en http://localhost:9003
```

---

## 🔐 Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# GENERAL
PORT=9003
NODE_ENV=development
FRONTEND_URL=http://localhost:9002
BACKEND_URL=http://localhost:9003

# BASE DE DATOS
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/4fun

# SEGURIDAD Y JWT
JWT_SECRET=<clave-secreta-min-32-caracteres>
JWT_EXPIRE=7d
JWT_COOKIE_EXPIRE=30

# MERCADO PAGO
MERCADOPAGO_ACCESS_TOKEN=<tu-access-token>
MERCADOPAGO_PUBLIC_KEY=<tu-public-key>
MERCADOPAGO_WEBHOOK_SECRET=<tu-webhook-secret>

# EMAIL (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<tu-email@gmail.com>
SMTP_PASS=<tu-app-password>
SMTP_FROM_EMAIL=<tu-email@gmail.com>
SMTP_FROM_NAME=4Fun Store

# LOGGING
LOG_LEVEL=info
```

> ⚠️ **Importante:** Nunca versiones el archivo `.env` con credenciales reales. Usa `.env.example` como plantilla.

---

## 📡 API Endpoints

Base URL: `http://localhost:9003/api`

### Autenticación (`/api/auth`)
| Método | Ruta                 | Descripción                    | Auth |
|--------|----------------------|--------------------------------|------|
| POST   | `/register`          | Registro de usuario            | ❌    |
| POST   | `/login`             | Inicio de sesión (JWT cookie)  | ❌    |
| POST   | `/logout`            | Cerrar sesión                  | ✅    |
| GET    | `/me`                | Perfil del usuario autenticado | ✅    |
| POST   | `/verify-email`      | Verificar email                | ❌    |

### Productos (`/api/products`)
| Método | Ruta           | Descripción                       | Auth      |
|--------|----------------|-----------------------------------|-----------|
| GET    | `/`            | Listar productos (con filtros)    | ❌         |
| GET    | `/:id`         | Detalle de producto               | ❌         |
| POST   | `/`            | Crear producto                    | ✅ Admin   |
| PUT    | `/:id`         | Actualizar producto               | ✅ Admin   |
| DELETE | `/:id`         | Eliminar producto                 | ✅ Admin   |

### Carrito (`/api/cart`)
| Método | Ruta           | Descripción                       | Auth |
|--------|----------------|-----------------------------------|------|
| GET    | `/`            | Obtener carrito                   | ✅    |
| POST   | `/add`         | Agregar al carrito                | ✅    |
| DELETE | `/remove/:id`  | Quitar del carrito                | ✅    |

### Órdenes (`/api/orders`)
| Método | Ruta           | Descripción                       | Auth      |
|--------|----------------|-----------------------------------|-----------|
| GET    | `/`            | Listar órdenes del usuario        | ✅         |
| GET    | `/:id`         | Detalle de orden                  | ✅         |
| POST   | `/`            | Crear orden (checkout)            | ✅         |
| PUT    | `/:id/status`  | Actualizar estado                 | ✅ Admin   |

### Wishlist (`/api/wishlist`)
| Método | Ruta           | Descripción                       | Auth |
|--------|----------------|-----------------------------------|------|
| GET    | `/`            | Obtener wishlist                  | ✅    |
| POST   | `/toggle`      | Agregar/quitar de wishlist        | ✅    |

### Reseñas (`/api/reviews`)
| Método | Ruta           | Descripción                       | Auth |
|--------|----------------|-----------------------------------|------|
| GET    | `/:productId`  | Obtener reseñas de un producto    | ❌    |
| POST   | `/`            | Crear reseña                      | ✅    |
| DELETE | `/:id`         | Eliminar reseña                   | ✅    |

### Cupones (`/api/coupons`)
| Método | Ruta           | Descripción                       | Auth      |
|--------|----------------|-----------------------------------|-----------|
| POST   | `/validate`    | Validar cupón                     | ✅         |
| POST   | `/`            | Crear cupón                       | ✅ Admin   |
| GET    | `/`            | Listar cupones                    | ✅ Admin   |

### Keys Digitales (`/api/keys`)
| Método | Ruta           | Descripción                       | Auth      |
|--------|----------------|-----------------------------------|-----------|
| POST   | `/`            | Asignar keys a producto           | ✅ Admin   |
| GET    | `/:productId`  | Obtener keys de un producto       | ✅ Admin   |

### Catálogo (`/api/platforms`, `/api/genres`)
| Método | Ruta              | Descripción                    | Auth      |
|--------|--------------------|-------------------------------|-----------|
| GET    | `/platforms`       | Listar plataformas            | ❌         |
| POST   | `/platforms`       | Crear plataforma              | ✅ Admin   |
| GET    | `/genres`          | Listar géneros                | ❌         |
| POST   | `/genres`          | Crear género                  | ✅ Admin   |

### Administración (`/api/admin`, `/api/dashboard`)
| Método | Ruta                  | Descripción                    | Auth      |
|--------|-----------------------|--------------------------------|-----------|
| GET    | `/dashboard/stats`    | Métricas del dashboard         | ✅ Admin   |
| GET    | `/admin/users`        | Gestión de usuarios            | ✅ Admin   |
| PUT    | `/admin/users/:id`    | Modificar rol de usuario       | ✅ Admin   |

### Contacto (`/api/contact`)
| Método | Ruta    | Descripción                         | Auth |
|--------|---------|-------------------------------------|------|
| POST   | `/`     | Enviar mensaje de contacto (email)  | ❌    |

### Utilidades
| Método | Ruta       | Descripción          | Auth |
|--------|------------|----------------------|------|
| GET    | `/health`  | Health check         | ❌    |

---

## 📊 Modelos de Datos

| Modelo       | Descripción                                           |
|--------------|-------------------------------------------------------|
| `User`       | Usuarios con roles (user/admin), verificación email   |
| `Product`    | Videojuegos con plataforma, género, precio, specs PC  |
| `Cart`       | Carrito de compras vinculado a usuario                |
| `Order`      | Órdenes con items, total, estado y pago               |
| `Wishlist`   | Lista de deseos del usuario                           |
| `Review`     | Reseñas con calificación (1-5 estrellas)              |
| `DigitalKey` | Keys para juegos digitales                            |
| `Coupon`     | Cupones de descuento con vigencia                     |
| `Platform`   | Plataformas (PC, PS5, Xbox, Switch, etc.)             |
| `Genre`      | Géneros de videojuegos                                |
| `Category`   | Categorías adicionales                                |

---

## 🛡 Seguridad

El backend implementa múltiples capas de seguridad:

- **Helmet** — Headers HTTP seguros
- **Rate Limiting** — Máx. 1000 requests/15min por IP en `/api`
- **CORS** — Whitelist de orígenes (localhost + Vercel deploys)
- **MongoDB Sanitize** — Prevención de inyección NoSQL
- **HPP** — Protección contra contaminación de parámetros HTTP
- **JWT en cookies** — Tokens seguros con `httpOnly` + `secure` en producción
- **bcryptjs** — Hash de contraseñas
- **Input Validation** — Validación con express-validator
- **Trust Proxy** — Configurado para load balancers (Render/Vercel)
- **Body Limit** — JSON limitado a 10KB para prevenir ataques de payload

---

## 🧪 Testing

```bash
# Ejecutar tests unitarios
npm test

# Ejecutar con watch
npx jest --watch
```

Tests implementados con **Jest** y **node-mocks-http**, ubicados en `tests/`.

---

## 🌐 Deployment

| Servicio     | URL                                                  |
|--------------|------------------------------------------------------|
| **Backend**  | `https://proyecto-back-9v79.onrender.com`            |
| **Frontend** | `https://4funstore-vercel.vercel.app`                |

- Backend desplegado en **Render**
- Frontend desplegado en **Vercel**
- Base de datos en **MongoDB Atlas**
- Tunelización local con **ngrok** para webhooks de MercadoPago

---

## 🎨 Frontend

El frontend es una aplicación **Next.js 15** con TypeScript, Tailwind CSS y componentes Radix UI. Se encuentra en el directorio `Proyecto-Front/`.

Para más detalles, consulta el [README del Frontend](../Proyecto-Front/README.md).

---

## 📜 Licencia

ISC © Mariano Martinez
