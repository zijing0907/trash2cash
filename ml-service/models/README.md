# Model files

This folder holds the export written by notebooks 01 and 03 (`AML_Waste_Project/export/` on Google
Drive, or `waste_models_export.zip`). Copy these files here:

| File | Needed? | In git? |
|---|---|---|
| `meta.json` | yes | yes |
| `best_cnn.keras` | yes | yes |
| `best_cnn_robust.keras` | if you ran notebook 03 (the service then uses it by default) | yes |
| `best_cnn_robust_noown.keras`, `best_fcnn*.keras` | no, the service does not use them | FCNN files are git-ignored |

The service picks `cnn_robust` if its file is here, otherwise `cnn`. Set `MODEL_KEY=cnn` in `.env`
to force the plain CNN.

`meta.json` is the single source of truth for class names, image size, bins, "not sure" thresholds,
the Grad-CAM layer and test metrics. The service never hard-codes these.
