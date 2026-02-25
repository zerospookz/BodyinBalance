# Fitness Coach Portal (Demo)

Това е демо проект (без backend) за:
- Admin панел: клиенти, тренировки, хранене, чат, снимки, Excel импорт на програми
- Client Portal: вход с код, тренировки, хранене, чат, снимки
- Нотификации: in-app + browser desktop (ако админ табът е отворен)

## Стартиране
Отвори `index.html` (двуклик) или го пусни през локален сървър.

## Excel формат (Sheet1)
Колони:
`Program | Day | Exercise | Sets | Reps | Rest | Note`

## Важно
- Данните са в LocalStorage (demo). Не е реална сигурност.
- За истински нотификации 24/7 (Telegram/Email/SMS) е нужен backend (Firebase/Supabase).


## Firebase версия (Var 1)
Тази версия използва Firebase Auth + Firestore.
