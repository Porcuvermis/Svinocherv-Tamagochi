# Эскизы аппарата алчности, версия 2

Плоские эскизы, по которым игрок выбирал крой и декор
(`docs/plan/31-greed-premium.md`, журнал 30.10). Не игра — чертёж:
опорные места взяты из версии 1, цвета и формы — образец для рисунка.

* `sketch.py` — крой: A, B, C, сплавы D, E и **принятый F**.
* `orn.py` — 8 плашек орнамента; приняты **1 веер-пятачок, 5 полосы с
  завитком, 8 радуга-кольца**.
* `place.py` — расстановка мотивов на F; принята **P3 «полосы ведут»**.

```bash
cd tools/greed-lux-sketch && mkdir -p sk orn pl
python3 sketch.py sk/ && python3 orn.py orn/ && python3 place.py pl/
NODE_PATH=/opt/node22/lib/node_modules node render.js sk/*.svg pl/*.svg
NODE_PATH=/opt/node22/lib/node_modules node render2.js orn/*.svg
```
