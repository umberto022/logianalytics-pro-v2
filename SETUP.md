# LogiAnalytics Pro v2 — Setup

## Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Auth**: Firebase Authentication (email/password + Google)
- **Database**: Firestore (tiempo real, sin SQLite)
- **Storage**: Firebase Storage (exportaciones)
- **Hosting**: Firebase Hosting

## 1. Crear proyecto Firebase

1. Ve a https://console.firebase.google.com
2. Crea un nuevo proyecto
3. Activa **Authentication** → Sign-in methods → Email/Password + Google
4. Activa **Firestore Database** → Modo producción
5. En Configuración del proyecto → Agrega una app Web
6. Copia las credenciales

## 2. Configurar variables de entorno

```bash
cp .env.local.example .env.local
```

Rellena `.env.local` con tus credenciales de Firebase.

## 3. Instalar y ejecutar en desarrollo

```bash
cd logi_analytics_pro_v2
npm install
npm run dev
```

Abre http://localhost:3000

## 4. Desplegar en Firebase Hosting

```bash
# Instala Firebase CLI si no lo tienes
npm install -g firebase-tools

# Login
firebase login

# Actualiza .firebaserc con tu project ID
firebase use TU_PROJECT_ID

# Despliega reglas de Firestore
firebase deploy --only firestore:rules

# Build y deploy completo
npm run deploy
```

## 5. Estructura de Firestore

```
users/{userId}              → Perfil del usuario
companies/{companyId}       → Datos de empresa
inventory/{userId}/items/{itemId}           → Inventario
inventoryMovements/{userId}/records/{id}    → Movimientos de stock
sales/{userId}/records/{saleId}             → Ventas
```

## Mejoras vs versión anterior (Streamlit + SQLite)

| Aspecto        | v1 (Streamlit)         | v2 (Next.js + Firebase)           |
|----------------|------------------------|-----------------------------------|
| Auth           | SHA-256 sin salt       | Firebase Auth (industry standard) |
| Base de datos  | SQLite local           | Firestore (nube, tiempo real)     |
| Frontend       | Python/Streamlit       | React + TypeScript                |
| UI             | Básica                 | shadcn/ui + Tailwind CSS          |
| Escalabilidad  | ~100 usuarios          | Millones de usuarios              |
| Seguridad      | Sin rate limiting      | Firebase Auth nativo              |
| Login social   | No                     | Google Sign-In                    |
| Hosting        | Local                  | Firebase Hosting (CDN global)     |
| PWA            | Meta tags sin soporte  | Manifest + offline ready          |
| Tipos          | Sin type hints         | TypeScript estricto               |
