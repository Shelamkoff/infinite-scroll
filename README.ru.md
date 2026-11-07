# @shelamkoff/infinite-scroll

Компактный infinite scroll без привязки к фреймворку. Контроллер использует
`IntersectionObserver`, добавляет один sentinel-элемент, не допускает
параллельных загрузок и поддерживает контейнеры с абсолютным позиционированием.

[Демо](https://shelamkoff.github.io/infinite-scroll/) ·
[English](README.md)

## Возможности

- Без обработчика события `scroll`
- Только одна активная загрузка
- Sentinel автоматически переносится после добавленного контента
- Настраиваемое расстояние предварительной загрузки
- Пауза и возобновление
- Обработка ошибок callback
- Ручное позиционирование sentinel для masonry-layout
- ESM и TypeScript declarations
- Без runtime-зависимостей

## Установка

```bash
npm install @shelamkoff/infinite-scroll
```

## Быстрый старт

```js
import { InfiniteScroll } from '@shelamkoff/infinite-scroll'

const feed = document.querySelector('.feed')

const infiniteScroll = new InfiniteScroll(feed, async () => {
  const items = await fetchNextPage()
  appendItems(feed, items)
}, {
  threshold: 400,
  onError(error) {
    showRetryMessage(error)
  },
})
```

Пока callback выполняется, повторные пересечения игнорируются. На одно
пересечение observer приходится один callback, поэтому видимый sentinel не
создаёт бесконечный цикл запросов. Верните `false`, когда список закончился:

```js
const infiniteScroll = new InfiniteScroll(feed, async () => {
  const page = await fetchNextPage()
  appendItems(feed, page.items)
  return page.hasMore
})
```

## API

### `new InfiniteScroll(container, callback, options?)`

| Параметр | Тип | По умолчанию | Назначение |
| --- | --- | --- | --- |
| `threshold` | `number` | `200` | Отступ предварительной загрузки в пикселях |
| `sentinel` | `string` | `infinite-scroll-sentinel` | CSS-класс созданного sentinel |
| `onError` | `(error: unknown) => void` | вывод в console | Получает ошибки callback |

`IntersectionObserver` должен быть доступен в окне контейнера либо через
глобальный polyfill. Поддерживаются контейнеры из iframe того же источника:
sentinel создаётся в документе контейнера, а observer использует его окно,
если в нём есть соответствующая реализация.

Корнем observer служит viewport. Родитель с `overflow` по-прежнему обрезает
область пересечения, поэтому `threshold` не добавляет отступ предварительной
загрузки внутри вложенного прокручиваемого контейнера.

### `setLoading(value)`

`true` ставит загрузку на паузу, `false` возобновляет её.

Возврат `false` из load callback использует то же состояние паузы. Вызывайте
`setLoading(false)` только если позже появились новые данные.

Если поставить загрузку на паузу и возобновить её до завершения callback,
observer проверит пересечение после его завершения. Повторная пауза,
`destroy()` или результат `false` отменяют эту отложенную проверку.
Параллельный callback при возобновлении не запускается.

### Ошибки загрузки и повторная попытка

`onError` получает синхронные исключения и ошибки отклонённых промисов загрузки.
Если сам обработчик `onError` выбросит исключение или вернёт отклонённый промис,
ошибка попадёт в консоль без необработанного отклонения промиса. Асинхронное
уведомление об ошибке не блокирует последующие загрузки.

Немедленного автоматического повтора после ошибки нет. Чтобы повторить загрузку
при видимом sentinel, явно поставьте её на паузу и возобновите в обработчике
действия пользователя:

```js
retryButton.addEventListener('click', () => {
  infiniteScroll.setLoading(true)
  infiniteScroll.setLoading(false)
})
```

Контроллер также не заполняет короткий viewport серией автоматических запросов.
Если после небольшой страницы sentinel остался видимым, следующая загрузка
требует нового пересечения либо явной паузы и возобновления. Если приложение
самостоятельно заполняет viewport, запрашивайте повторную проверку только после
подтверждённого добавления контента.

### `updateSentinelPosition(top)`

После расчёта абсолютного layout передайте высоту контейнера:

```js
infiniteScroll.updateSentinelPosition(containerHeight)
```

Контейнер должен задавать контекст позиционирования sentinel — обычно через
`position: relative`. `top` — конечное неотрицательное смещение в CSS-пикселях.

### `destroy()`

Отключает observer и удаляет sentinel. Повторный вызов безопасен. Остальные
методы после уничтожения экземпляра выбрасывают ошибку.

Уже выполняющийся callback не отменяется. Сетевыми запросами и изменениями DOM
управляет приложение: отменяйте незавершённые fetch-запросы через
`AbortController` либо игнорируйте результат после закрытия представления.
Поздняя ошибка callback по-прежнему передаётся в `onError`.

Контроллер не хранит загруженные элементы, не виртуализирует ленту и не удаляет
старый контент. Рост DOM и состояние пагинации контролирует приложение.

## Разработка

```bash
npm ci
npx playwright install chromium firefox webkit
npm run verify
npm test
npm run demo
```

`verify` запускает регрессионные тесты ядра и dev-сервера, строгую проверку
TypeScript-потребителей, проверку установленного npm-архива и браузерные
сценарии. `prepublishOnly` выполняет те же проверки. CI проверяет пакет на
Node.js 20 и 24, а браузерные сценарии — в Chromium, Firefox и WebKit.

Для скриптов разработки нужен Node.js 20+. Код библиотеки — браузерный ESM.
Импортировать модуль без DOM безопасно; для создания контроллера нужен
браузерный документ.

## Лицензия

MIT
