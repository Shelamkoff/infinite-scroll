# @shelamkoff/infinite-scroll

Компактный infinite scroll без привязки к фреймворку. Контроллер использует
`IntersectionObserver`, добавляет один sentinel-элемент, не допускает
параллельных загрузок и поддерживает контейнеры с абсолютным позиционированием.

[Демо](https://shelamkoff.github.io/infinite-scroll/) ·
[English](README.md)

## Возможности

- Без обработчика события `scroll`
- Только одна активная загрузка
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

Пока callback выполняется, повторные пересечения игнорируются. После его
завершения наблюдатель обновляется, поэтому следующая загрузка сработает, даже
если sentinel всё ещё находится во viewport.

## API

### `new InfiniteScroll(container, callback, options?)`

| Параметр | Тип | По умолчанию | Назначение |
| --- | --- | --- | --- |
| `threshold` | `number` | `200` | Отступ предварительной загрузки в пикселях |
| `sentinel` | `string` | `infinite-scroll-sentinel` | CSS-класс созданного sentinel |
| `onError` | `(error: unknown) => void` | вывод в console | Получает ошибки callback |

Браузер должен поддерживать `IntersectionObserver`.

### `setLoading(value)`

`true` ставит загрузку на паузу, `false` возобновляет её.

### `updateSentinelPosition(top)`

После расчёта абсолютного layout передайте высоту контейнера:

```js
infiniteScroll.updateSentinelPosition(containerHeight)
```

### `destroy()`

Отключает observer и удаляет sentinel. Повторный вызов безопасен. Остальные
методы после уничтожения экземпляра выбрасывают ошибку.

## Разработка

```bash
npm test
npm run build
npm run demo
```

## Лицензия

MIT
