# =============================================================================
#  model.py — Model Loading + GradCAM + Inference
#  4 classes: Benign / Leukoplakia / Normal / OSCC  (alphabetical)
# =============================================================================

import io, pickle, base64, cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models, transforms
from torchvision.models import DenseNet169_Weights
from PIL import Image

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH  = "./model/best_model.pkl"
DEVICE      = "cpu"
IMG_SIZE    = 224

# ImageFolder sorts alphabetically → Benign=0, Leukoplakia=1, Normal=2, OSCC=3
CLASS_NAMES = ["Benign", "Leukoplakia", "Normal", "OSCC"]

RISK_CONFIG = {
    "Normal":      {"score": 1, "level": "LOW",    "urgency": "Routine follow-up in 12 months."},
    "Benign":      {"score": 3, "level": "LOW",    "urgency": "Monitor every 6 months. No immediate intervention."},
    "Leukoplakia": {"score": 6, "level": "MEDIUM", "urgency": "Biopsy recommended within 4–6 weeks. Refer to oral surgeon."},
    "OSCC":        {"score": 9, "level": "HIGH",   "urgency": "Urgent referral to oncologist. Do not delay treatment."},
}

CLINICAL_DESC = {
    "Normal": "Oral tissue appears healthy with normal mucosal architecture. No signs of dysplasia or malignancy detected. Regular surface morphology with intact epithelial barrier.",
    "Benign": "Benign oral lesion detected. Non-malignant tissue changes observed with no invasive growth pattern. Regular monitoring advised to track any changes.",
    "Leukoplakia": "Oral leukoplakia detected with white mucosal patch on epithelial surface. Hyperkeratosis and possible dysplastic changes present. Pre-malignant condition with risk of transformation to OSCC. Biopsy strongly recommended.",
    "OSCC": "Oral squamous cell carcinoma detected. Malignant epithelial cells with irregular morphology and invasive growth pattern. Stromal infiltration observed. Immediate oncological review and staging required.",
}

# ── Transform ─────────────────────────────────────────────────────────────────
_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225]),
])


# ── CPU-safe unpickler ────────────────────────────────────────────────────────
class CpuUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if module == "torch.storage" and name == "_load_from_bytes":
            return lambda b: torch.load(io.BytesIO(b), map_location="cpu")
        return super().find_class(module, name)


def _load_state(path: str):
    with open(path, "rb") as f:
        state = CpuUnpickler(f).load()
    return state["model_state"] if isinstance(state, dict) and "model_state" in state else state


# ── Build DenseNet169 (matches fine-tuning architecture exactly) ──────────────
def _build_model(num_classes: int = 4) -> nn.Module:
    m = models.densenet169(weights=None)
    f = m.classifier.in_features   # 1664
    m.classifier = nn.Sequential(
        nn.Linear(f, 512),
        nn.BatchNorm1d(512),
        nn.ReLU(inplace=True),
        nn.Dropout(p=0.50),

        nn.Linear(512, 128),
        nn.BatchNorm1d(128),
        nn.ReLU(inplace=True),
        nn.Dropout(p=0.40),

        nn.Linear(128, num_classes),
    )
    return m


# ── Load model once at import ─────────────────────────────────────────────────
print("▸ Loading DenseNet169 multiclass ...")
_model = _build_model(num_classes=len(CLASS_NAMES))
_model.load_state_dict(_load_state(MODEL_PATH))
_model.to(DEVICE).eval()
print(f"  ✔ Model loaded | Classes: {CLASS_NAMES}\n")


# ── GradCAM ───────────────────────────────────────────────────────────────────
class _GradCAM:
    def __init__(self, model: nn.Module):
        self.model = model
        self.grads = self.acts = None
        self._h = [
            model.features.denseblock4.register_forward_hook(
                lambda m, i, o: setattr(self, "acts", o.detach())),
            model.features.denseblock4.register_full_backward_hook(
                lambda m, gi, go: setattr(self, "grads", go[0].detach())),
        ]

    def remove(self):
        for h in self._h:
            h.remove()

    def __call__(self, tensor: torch.Tensor):
        self.model.eval()
        self.model.zero_grad()
        with torch.enable_grad():
            inp    = tensor.clone().to(DEVICE).requires_grad_(True)
            logits = self.model(inp)
            pred   = logits.argmax(1).item()
            logits[0, pred].backward()

        w   = self.grads.mean(dim=(2, 3), keepdim=True)
        cam = F.relu((w * self.acts).sum(1)).squeeze().cpu().numpy()
        cam -= cam.min()
        if cam.max() > 0:
            cam /= cam.max()
        heatmap = cv2.resize(cam, (IMG_SIZE, IMG_SIZE),
                             interpolation=cv2.INTER_CUBIC)
        return heatmap, pred


def _make_overlay(pil_img: Image.Image, heatmap: np.ndarray, alpha=0.45) -> str:
    img_np = np.array(pil_img.resize((IMG_SIZE, IMG_SIZE))).astype(np.uint8)
    hm_rgb = cv2.cvtColor(
        cv2.applyColorMap(np.uint8(255 * heatmap), cv2.COLORMAP_JET),
        cv2.COLOR_BGR2RGB)
    overlay = np.uint8((1 - alpha) * img_np + alpha * hm_rgb)
    _, buf  = cv2.imencode(".jpg",
                            cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))
    return base64.b64encode(buf.tobytes()).decode("utf-8")


# ── Public inference function ─────────────────────────────────────────────────
def predict(image_bytes: bytes) -> dict:
    """
    Run DenseNet169 + GradCAM on raw image bytes.
    Returns full prediction dict.
    """
    pil    = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = _transform(pil).unsqueeze(0)

    # GradCAM
    gcam              = _GradCAM(_model)
    heatmap, pred_idx = gcam(tensor)
    gcam.remove()

    # Probabilities
    with torch.no_grad():
        probs = torch.softmax(
            _model(tensor.to(DEVICE)), 1
        ).cpu().squeeze().numpy()

    pred_class = CLASS_NAMES[pred_idx]
    confidence = float(probs[pred_idx]) * 100
    risk       = RISK_CONFIG[pred_class]

    return {
        "predicted_class":    pred_class,
        "confidence":         round(confidence, 2),
        "probabilities":      {c: round(float(probs[i]) * 100, 2)
                               for i, c in enumerate(CLASS_NAMES)},
        "gradcam_b64":        _make_overlay(pil, heatmap),
        "risk_score":         risk["score"],
        "risk_level":         risk["level"],
        "recommendation":     risk["urgency"],
        "clinical_description": CLINICAL_DESC[pred_class],
    }