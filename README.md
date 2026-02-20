# BodyInBalance (Firebase Sync)

Тази версия синхронизира данните (клиенти, тренировки, хранене, чат, снимки) през **Firebase**,
за да се виждат от **всяко устройство** (твоят PC + клиентски телефони/PC).

## 1) Firebase setup (10 мин)
1. https://console.firebase.google.com → Create project
2. Build → Authentication → Get started → **Email/Password** → Enable
3. Build → Firestore Database → Create database (Production mode)
4. Project settings → General → Your apps → Add app → Web → Copy **firebaseConfig**
5. Сложи config-а в `firebase-config.js`

## 2) Създай Admin акаунт
Authentication → Users → Add user
- Email: (твоя)
- Password: (твоя)
*Това е входът за admin панела.*

## 3) Firestore Rules (копирай)
Firestore → Rules:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // only logged-in admins can access everything
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> Ако искаш по-строги правила (clients да виждат само своето), кажи ми и ще ги направя.

## 4) Deploy (безплатно)
- GitHub Pages (static) или Netlify/Vercel.
- Важно: за Firebase Auth трябва правилен domain в Firebase → Authentication → Settings → Authorized domains
  Добави: `zerospookz.github.io` (или твоя домейн)

## URLs
- Landing: `/index.html`
- Admin: `/admin.html`
- Portal: `/portal.html?code=ABCD`

