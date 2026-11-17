# stuff

Всякое разное: небольшие игры, помощники и прочие мелочи.

| Папка | Что |
|---|---|
| [`five-letters/`](five-letters/README.md) | помощник для игры «5 букв» (сайт и консоль) |

## Сайт

Публикуется только папка [`site/`](site/), остальное остаётся в репозитории. Деплой — workflow
[`pages.yml`](.github/workflows/pages.yml) при пуше в `main`.

Локально:

```sh
python3 -m http.server 8000 --directory site
```
