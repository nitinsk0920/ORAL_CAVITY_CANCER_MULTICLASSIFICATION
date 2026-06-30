# Oral Cancer Detection System

An explainable 4-class oral lesion screening system built around a fine-tuned DenseNet169 model. The project contains a FastAPI inference backend, a React + Tailwind CSS clinical frontend, a LangGraph-based analysis workflow, Grad-CAM visual explanation, and deployment files for running the backend as a Hugging Face Docker Space.

The fine-tuned model used by this application was produced from the notebook:

```text
multi-class-oral-detection (1).ipynb
```

The deployed checkpoint is stored as:

```text
model/best_model.pkl
```

## Important Disclaimer

This project is an AI screening support tool. It is not a substitute for biopsy, histopathology, clinical diagnosis, oral medicine review, or oncologist consultation.

## Classes

The deployed inference code uses four classes:

```text
Benign
Leukoplakia
Normal
OSCC
```

The class order in `model.py` is alphabetical because the training dataset was loaded with `torchvision.datasets.ImageFolder`.

## Main Features

- Upload an oral cavity image from the web interface.
- Send the image and patient ID to the FastAPI backend as `multipart/form-data`.
- Run DenseNet169 inference for 4-class classification.
- Return predicted class, confidence, class probabilities, risk score, clinical description, recommendation, Grad-CAM heatmap, and final clinical report.
- Display original image, Grad-CAM, probability bars, risk banner, risk gauge, recommendation, and report in a clinical dark-themed dashboard.
- Download the generated report as `.txt`.
- Download the Grad-CAM heatmap as `.jpg`.
- Deploy backend through Hugging Face Spaces using Docker.
- Deploy frontend separately as a static React/Vite build.

## Project Structure

```text
.
+-- api.py                         # FastAPI backend and API schema
+-- workflow.py                    # LangGraph analysis workflow
+-- model.py                       # DenseNet169 model loading, inference and Grad-CAM
+-- model/
|   +-- best_model.pkl             # Fine-tuned DenseNet169 checkpoint
+-- frontend/
|   +-- src/main.jsx               # React application
|   +-- src/styles.css             # Tailwind/custom CSS
|   +-- package.json               # React/Vite scripts and dependencies
|   +-- tailwind.config.js
|   +-- vite.config.js
|   +-- .env.example
+-- Dockerfile                     # Hugging Face Spaces backend deployment
+-- requirements.txt               # Python backend dependencies
+-- requirements-hf.txt            # Hugging Face Docker dependencies excluding torch
+-- .python-version
+-- app.py                         # Legacy Streamlit entrypoint replacement note
```

The `oral-cavity-cancer-backend/` folder, if present locally, is a copied Hugging Face Space repository used for deployment. The main source files are the root-level files listed above.

## Model Fine-Tuning Summary

The notebook prepares and trains a 4-class DenseNet169 model on a balanced multiclass oral lesion dataset.

### Dataset Preparation

The final 4-class notebook path merges data from these dataset sources:

- Oral Cancer Dataset with `CANCER` mapped to `OSCC` and `NON CANCER` mapped to `Normal`.
- Histopathology dataset with `Normal` and `OSCC` folders.
- NDB-UFES dataset using the Excel diagnosis column for `OSCC`, `Leukoplakia`, and `Normal` labels.
- Mohamedgobara oral lesions dataset with benign and malignant folders mapped to `Benign` and `OSCC`.
- Roboflow leukoplakia dataset mapped to `Leukoplakia`.

The notebook writes the merged dataset to:

```text
/kaggle/working/merged_multiclass_final
```

Then it balances classes into:

```text
/kaggle/working/balanced_multiclass_final
```

The balancing target in the final 4-class notebook cell is:

```text
3000 images per class
```

### Training Configuration

The final DenseNet169 training cell uses:

- `torchvision.models.densenet169`
- ImageNet initialization: `DenseNet169_Weights.IMAGENET1K_V1`
- Image size: `224`
- Batch size: `32`
- Train / validation / test split: `70% / 15% / 15%`
- Stratified splitting with `random_state=42`
- Weight decay: `1e-4`
- Label smoothing: `0.10`
- Gradient clipping: `1.0`
- Early stopping patience: `4`
- CosineAnnealingWarmRestarts scheduler
- Mixed precision AMP when CUDA is available
- `channels_last` memory format for CNN speed

### Training Transforms

The training transform in the notebook includes:

- Resize to `IMG_SIZE + 32`
- Random crop to `224`
- Random horizontal flip
- Random vertical flip
- Random rotation
- Color jitter
- Random affine transform
- Random grayscale
- Random perspective
- Gaussian blur
- ImageNet normalization
- Random erasing

Validation and test transforms use resize to `224`, tensor conversion, and ImageNet normalization.

### DenseNet169 Classifier Head

The fine-tuning notebook replaces the DenseNet169 classifier with:

```text
Linear(in_features, 512)
BatchNorm1d(512)
ReLU
Dropout(0.50)
Linear(512, 128)
BatchNorm1d(128)
ReLU
Dropout(0.40)
Linear(128, num_classes)
```

The deployed `model.py` rebuilds the same classifier head before loading `model/best_model.pkl`.

### Two-Phase Fine-Tuning

The notebook trains in two phases:

1. Phase 1: freeze the DenseNet backbone and train only the classifier head.
   - Learning rate: `3e-4`
   - Epochs: `5`

2. Phase 2: unfreeze `denseblock3`, `denseblock4`, `norm5`, and the classifier.
   - Learning rate: `5e-5`
   - Epochs: `15`

The best model weights are saved to:

```text
/kaggle/working/best_densenet169_multiclass.pkl
```

The project uses the downloaded/exported checkpoint as:

```text
model/best_model.pkl
```

## Backend

The backend is implemented in `api.py`, `workflow.py`, and `model.py`.

### FastAPI Endpoints

`GET /`

Returns a simple API message.

`GET /health`

Returns backend health status and the model description.

Example response:

```json
{
  "status": "ok",
  "classes": ["Benign", "Leukoplakia", "Normal", "OSCC"],
  "model": "DenseNet169 multiclass fine-tuned"
}
```

`POST /analyse`

Accepts a multipart form request:

```text
file: image file
patient_id: string
```

Returns:

```text
patient_id
filename
predicted_class
confidence
probabilities
gradcam_b64
risk_score
risk_level
recommendation
clinical_description
report_detail
risk_path
final_report
error
```

The backend imports `workflow` lazily inside `/analyse`, so `/health` can respond without loading the model first.

### LangGraph Workflow

`workflow.py` builds a LangGraph `StateGraph` with these nodes:

1. `preprocess`
   - Validates and decodes uploaded image bytes with PIL.

2. `densenet`
   - Runs DenseNet169 inference and Grad-CAM.

3. `router`
   - Routes `Normal` and `Benign` to low-risk reporting.
   - Routes `Leukoplakia` and `OSCC` to high-risk reporting.

4. `report_low`
   - Generates brief clinical description for low-risk predictions.

5. `report_high`
   - Generates detailed clinical description for high-risk predictions.

6. `risk_score`
   - Adds risk score, risk level, recommendation, and final text report.

### Risk Mapping

The deployed risk configuration is:

```text
Normal      -> score 1, LOW
Benign      -> score 3, LOW
Leukoplakia -> score 6, MEDIUM
OSCC        -> score 9, HIGH
```

## Model Inference and Grad-CAM

`model.py`:

- Rebuilds DenseNet169 with the custom classifier head.
- Loads `model/best_model.pkl` on CPU.
- Applies the same inference preprocessing:
  - Resize to `224 x 224`
  - Convert to tensor
  - Normalize with ImageNet mean and standard deviation
- Runs softmax classification.
- Generates Grad-CAM using hooks on:

```text
model.features.denseblock4
```

- Creates a JET heatmap overlay with OpenCV.
- Encodes the Grad-CAM result as base64 JPEG for the API response.

## Frontend

The frontend is in the `frontend/` directory.

### Stack

- React 18
- Vite
- Tailwind CSS v3
- JavaScript and JSX
- HTML/CSS
- Browser `fetch()` API

No external UI component library is used.

### Frontend Features

- Clinical dark theme.
- Sidebar with patient ID, API health indicator, workflow steps, risk legend, class legend, and disclaimer.
- Drag-and-drop image upload.
- Image preview using `URL.createObjectURL`.
- Analysis request using `fetch()` and `FormData`.
- Loading skeletons while the API is processing.
- Risk banner with predicted class, confidence, risk score, and risk level.
- Original image panel.
- Grad-CAM heatmap panel.
- Animated probability bars.
- Clinical description panel.
- Circular risk gauge.
- Recommendation card.
- Scrollable full clinical report.
- Report and heatmap downloads using browser `Blob` URLs.

### Frontend Environment Variable

The frontend reads:

```text
VITE_API_BASE_URL
```

If the variable is not set, it falls back to:

```text
http://127.0.0.1:8000
```

Example `.env` for local frontend:

```text
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Local Development

### Backend

Create and activate a Python environment, then install dependencies:

```bash
pip install -r requirements.txt
```

Run the backend:

```bash
uvicorn api:app --reload
```

The backend will run at:

```text
http://127.0.0.1:8000
```

Check health:

```text
http://127.0.0.1:8000/health
```

Swagger UI:

```text
http://127.0.0.1:8000/docs
```

### Frontend

Install dependencies:

```bash
cd frontend
npm install
```

Run the frontend:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview production build locally:

```bash
npm run preview
```

## Deployment

### Backend on Hugging Face Spaces

The backend Docker deployment uses:

```text
Dockerfile
requirements-hf.txt
api.py
model.py
workflow.py
model/best_model.pkl
```

The Dockerfile:

- Uses `python:3.11-slim`
- Installs CPU PyTorch and torchvision from the PyTorch CPU wheel index
- Installs FastAPI, Uvicorn, LangGraph, LangChain, Pillow, OpenCV headless, and NumPy
- Runs Uvicorn on port `7860`

Start command inside Docker:

```text
uvicorn api:app --host 0.0.0.0 --port 7860
```

Expected Hugging Face backend URL format:

```text
https://<username>-<space-name>.hf.space
```

### Frontend on Render Static Site

Use these Render settings for the frontend:

```text
Root Directory: frontend
Build Command: npm run build
Publish Directory: dist
```

Set the frontend environment variable:

```text
VITE_API_BASE_URL=https://<username>-<space-name>.hf.space
```

Do not append `/health` or `/analyse` to the environment variable.

## Notes on Render Backend Free Tier

This project was moved away from Render free backend hosting because `/analyse` loads and runs PyTorch + DenseNet169 + Grad-CAM, which exceeded the 512 MB memory available on the free Render backend instance. The React frontend can still be hosted as a static site.

## API Example

Using `curl`:

```bash
curl -X POST "http://127.0.0.1:8000/analyse" \
  -F "file=@sample.jpg;type=image/jpeg" \
  -F "patient_id=P001"
```

## Files Not Required for Deployment

Do not deploy or commit local environment folders or build outputs:

```text
myenv/
__pycache__/
frontend/node_modules/
frontend/dist/
.env
```

## Safety and Limitations

- The system performs image-based screening only.
- Results depend on uploaded image quality and the model checkpoint.
- Grad-CAM highlights model attention but does not prove clinical causality.
- Recommendations are rule-based mappings from predicted class and risk level.
- Clinical confirmation is required for any concerning or uncertain result.

