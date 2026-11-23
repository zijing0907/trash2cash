# ml/ — where the model comes from

The notebooks in `notebooks/` are copies of our UECS2523 Applied Machine Learning group project
(with Benjamin Thio Zi Liang, Chew Zi Jing and Jeremy Gabriel Lee Ji Hin). The original repository,
with full history, is [zijing0907/machine-learning](https://github.com/zijing0907/machine-learning)
(copied at commit `c68f468`).

**Nothing is trained in this repo.** The notebooks run on Google Colab and write an export folder
(`meta.json` + `.keras` files) that `ml-service/` serves.

| Notebook | What it does | What `ml-service` uses from it |
|---|---|---|
| `01_train_fcnn_cnn_from_scratch.ipynb` | Data audit, FCNN vs CNN trained from scratch, picks the "not sure" threshold, exports `best_cnn.keras` and `meta.json` | `dhash`, the class-to-bin mapping, `meta.json` |
| `02_real_life_photo_demo.ipynb` | Tests the models on our own phone photos; Gradio demo | `to_rgb`, `center_crop_resize`, `open_photo`, `predict`, `zoom_boxes`, `zoom_search`, `grad_cam`, `overlay`, `verdict` (ported to `ml-service/app/`) |
| `03_robust_cnn_from_scratch.ipynb` | CNN-R: background swap, extra datasets and our own photos; exports `best_cnn_robust.keras` and `unsure_below_robust` | the robust model |

If a notebook changes the preprocessing, `ml-service/app/preprocessing.py` must change the same way,
and the parity test (`ml-service/tests/test_parity.py`) must be regenerated.
