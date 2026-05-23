import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const DISPLAY_CLASSES = ["Normal", "Benign", "Leukoplakia", "OSCC"];

const CLASS_META = {
  Normal: {
    color: "#22c55e",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.5)",
  },
  Benign: {
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.12)",
    border: "rgba(59, 130, 246, 0.5)",
  },
  Leukoplakia: {
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.5)",
  },
  OSCC: {
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.55)",
  },
};

const RISK_META = {
  LOW: {
    color: "#22c55e",
    bg: "linear-gradient(135deg, rgba(34,197,94,0.20), rgba(0,200,255,0.08))",
    border: "rgba(34, 197, 94, 0.55)",
  },
  MEDIUM: {
    color: "#f59e0b",
    bg: "linear-gradient(135deg, rgba(245,158,11,0.22), rgba(0,200,255,0.07))",
    border: "rgba(245, 158, 11, 0.58)",
  },
  HIGH: {
    color: "#ef4444",
    bg: "linear-gradient(135deg, rgba(239,68,68,0.24), rgba(0,200,255,0.06))",
    border: "rgba(239, 68, 68, 0.62)",
  },
};

function classMeta(className) {
  return CLASS_META[className] || {
    color: "#94a3b8",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.42)",
  };
}

function riskMeta(level) {
  return RISK_META[String(level || "LOW").toUpperCase()] || RISK_META.LOW;
}

function asPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric <= 1 ? numeric * 100 : numeric;
}

function formatPercent(value) {
  return `${asPercent(value).toFixed(1)}%`;
}

function safeFileSegment(value) {
  return (
    String(value || "patient")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "patient"
  );
}

function base64ToBlob(base64, mimeType) {
  const cleanBase64 = String(base64 || "").replace(/^data:[^,]+,/, "");
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function Panel({ title, tone = "#00c8ff", children, className = "" }) {
  return (
    <section className={`clinical-card ${className}`} style={{ "--accent": tone }}>
      {title ? (
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

function Sidebar({ patientId, setPatientId, health }) {
  const statusColor =
    health.status === "online" ? "#22c55e" : health.status === "offline" ? "#ef4444" : "#f59e0b";

  return (
    <aside className="sticky top-0 h-screen overflow-y-auto border-r border-clinical-border/80 bg-[#061120]/95 px-5 py-6 backdrop-blur">
      <div className="mb-7">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-clinical-cyan">
          Oral AI Console
        </p>
        <h1 className="mt-3 font-mono text-xl font-semibold leading-tight text-slate-50">
          Oral Cancer Detection System
        </h1>
        <p className="mt-3 text-sm leading-6 text-clinical-muted">
          DenseNet169 multiclass screening dashboard for clinician review.
        </p>
      </div>

      <label className="block">
        <span className="form-label">Patient ID</span>
        <input
          value={patientId}
          onChange={(event) => setPatientId(event.target.value)}
          className="field"
          placeholder="P001"
        />
      </label>

      <div className="mt-5 rounded-md border border-clinical-border bg-clinical-panel/80 p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-slate-300">
            API Status
          </span>
          <span className="flex items-center gap-2 text-sm text-slate-200">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: statusColor, boxShadow: `0 0 12px ${statusColor}` }}
            />
            {health.status === "online" ? "Online" : health.status === "offline" ? "Offline" : "Checking"}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-clinical-muted">
          {health.detail || "Pinging FastAPI at 127.0.0.1:8000"}
        </p>
      </div>

      <div className="mt-6">
        <h2 className="sidebar-heading">Workflow</h2>
        <ol className="space-y-3">
          {["Upload image", "Run API analysis", "Review Grad-CAM", "Export clinical report"].map((step, index) => (
            <li key={step} className="flex items-center gap-3 text-sm text-slate-300">
              <span className="grid h-6 w-6 place-items-center rounded-full border border-clinical-cyan/40 bg-clinical-cyan/10 font-mono text-[0.65rem] text-clinical-cyan">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6">
        <h2 className="sidebar-heading">Risk Legend</h2>
        <div className="space-y-2">
          {[
            ["LOW", "Normal / Benign", "#22c55e"],
            ["MEDIUM", "Leukoplakia", "#f59e0b"],
            ["HIGH", "OSCC", "#ef4444"],
          ].map(([level, label, color]) => (
            <div
              key={level}
              className="flex items-center justify-between rounded-md border border-clinical-border bg-clinical-panel/60 px-3 py-2"
            >
              <span className="text-sm text-slate-300">{label}</span>
              <span className="font-mono text-xs font-semibold" style={{ color }}>
                {level}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="sidebar-heading">Classes</h2>
        <div className="grid grid-cols-2 gap-2">
          {DISPLAY_CLASSES.map((name) => {
            const meta = classMeta(name);
            return (
              <div
                key={name}
                className="rounded-md border px-3 py-2 text-xs"
                style={{ borderColor: meta.border, background: meta.bg }}
              >
                <span className="font-mono font-semibold" style={{ color: meta.color }}>
                  {name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-md border border-amber-400/35 bg-amber-400/10 p-4 text-xs leading-5 text-amber-100">
        AI screening support only. This interface does not replace biopsy, pathology,
        oral medicine review, or clinician diagnosis.
      </div>
    </aside>
  );
}

function UploadSection({
  file,
  previewUrl,
  patientId,
  setPatientId,
  onFileChange,
  onAnalyse,
  loading,
  error,
}) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) onFileChange(droppedFile);
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <div
        className={`upload-zone ${dragging ? "border-clinical-cyan bg-clinical-cyan/10" : "border-clinical-border"}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/bmp"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) onFileChange(selected);
          }}
        />
        {previewUrl ? (
          <div className="grid h-full gap-5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
            <img
              src={previewUrl}
              alt="Uploaded oral cavity preview"
              className="h-64 w-full rounded-md border border-clinical-border object-cover md:h-full"
            />
            <div className="flex flex-col justify-center">
              <p className="font-mono text-sm uppercase tracking-[0.12em] text-clinical-cyan">
                Image Ready
              </p>
              <p className="mt-3 break-all text-lg font-semibold text-slate-100">{file?.name}</p>
              <p className="mt-2 text-sm text-clinical-muted">
                Click or drop another image to replace this selection.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center text-center">
            <div>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-clinical-cyan/40 bg-clinical-cyan/10 font-mono text-xl text-clinical-cyan">
                IMG
              </div>
              <p className="mt-5 font-mono text-lg font-semibold text-slate-50">
                Drag and drop oral cavity image
              </p>
              <p className="mt-2 text-sm text-clinical-muted">
                JPG, PNG, JPEG, or BMP images are accepted.
              </p>
            </div>
          </div>
        )}
      </div>

      <Panel title="Analysis Request" className="flex flex-col justify-between">
        <div className="space-y-4">
          <label className="block">
            <span className="form-label">Patient ID</span>
            <input
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
              className="field"
              placeholder="P001"
            />
          </label>
          {error ? (
            <div className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onAnalyse}
          disabled={!file || !patientId.trim() || loading}
          className="mt-6 h-12 rounded-md border border-clinical-cyan/70 bg-clinical-cyan px-5 font-mono text-sm font-bold uppercase tracking-[0.12em] text-[#04101d] shadow-cyan transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none disabled:hover:translate-y-0"
        >
          {loading ? "Analysing..." : "Analyse"}
        </button>
      </Panel>
    </section>
  );
}

function LoadingDashboard() {
  return (
    <section className="animate-fade-in space-y-5">
      <div className="skeleton h-28" />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="skeleton h-80" />
        <div className="skeleton h-80" />
        <div className="skeleton h-80" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="skeleton h-56" />
        <div className="skeleton h-56" />
      </div>
    </section>
  );
}

function Metric({ label, value, color }) {
  return (
    <div className="min-w-32 rounded-md border border-white/10 bg-black/20 px-4 py-3">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-semibold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function RiskBanner({ result }) {
  const level = String(result.risk_level || "LOW").toUpperCase();
  const meta = riskMeta(level);
  const prediction = result.predicted_class || "Unknown";
  const routeLabel = result.risk_path ? result.risk_path.replace(/_/g, " ") : "clinical review";

  return (
    <section
      className="animate-fade-in rounded-md border p-5 shadow-cyan"
      style={{ background: meta.bg, borderColor: meta.border }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: meta.color }}>
            {level} Risk Path
          </p>
          <h2 className="mt-2 font-mono text-3xl font-semibold text-slate-50">{prediction}</h2>
          <p className="mt-2 text-sm capitalize text-slate-300">Route: {routeLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Confidence" value={formatPercent(result.confidence)} color={classMeta(prediction).color} />
          <Metric label="Risk Score" value={`${result.risk_score ?? 0}/10`} color={meta.color} />
          <Metric label="Level" value={level} color={meta.color} />
        </div>
      </div>
    </section>
  );
}

function ProbabilityBars({ probabilities }) {
  const [animate, setAnimate] = useState(false);
  const entries = useMemo(() => {
    const source = probabilities || {};
    return DISPLAY_CLASSES.map((name) => [name, source[name] ?? 0]).sort(
      (a, b) => asPercent(b[1]) - asPercent(a[1]),
    );
  }, [probabilities]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setAnimate(true));
    return () => window.cancelAnimationFrame(id);
  }, [probabilities]);

  return (
    <Panel title="Class Probabilities">
      <div className="mt-5 space-y-4">
        {entries.map(([name, value]) => {
          const percent = Math.max(0, Math.min(100, asPercent(value)));
          const meta = classMeta(name);
          return (
            <div key={name}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <span className="font-mono text-sm font-semibold" style={{ color: meta.color }}>
                  {name}
                </span>
                <span className="font-mono text-sm text-slate-100">{percent.toFixed(1)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: animate ? `${percent}%` : "0%",
                    backgroundColor: meta.color,
                    boxShadow: `0 0 18px ${meta.color}`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function RiskGauge({ score, level }) {
  const boundedScore = Math.max(0, Math.min(10, Number(score) || 0));
  const meta = riskMeta(level);
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (boundedScore / 10) * circumference;

  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-clinical-border bg-[#071222] p-5">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="42" stroke="#13283f" strokeWidth="8" fill="none" />
          <circle
            cx="50"
            cy="50"
            r="42"
            stroke={meta.color}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-mono text-3xl font-semibold" style={{ color: meta.color }}>
              {boundedScore}
            </p>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-slate-400">
              of 10
            </p>
          </div>
        </div>
      </div>
      <p className="mt-3 font-mono text-sm uppercase tracking-[0.12em]" style={{ color: meta.color }}>
        {String(level || "LOW").toUpperCase()} Risk
      </p>
    </div>
  );
}

function ResultsDashboard({ result, previewUrl, patientId }) {
  const predictionMeta = classMeta(result.predicted_class);
  const levelMeta = riskMeta(result.risk_level);
  const gradcamSrc = result.gradcam_b64
    ? `data:image/jpeg;base64,${String(result.gradcam_b64).replace(/^data:[^,]+,/, "")}`
    : "";

  function handleReportDownload() {
    const reportText = result.final_report || "No report text returned by API.";
    const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `oral_report_${safeFileSegment(patientId)}_${safeFileSegment(result.predicted_class)}.txt`);
  }

  function handleHeatmapDownload() {
    if (!result.gradcam_b64) return;
    const blob = base64ToBlob(result.gradcam_b64, "image/jpeg");
    downloadBlob(blob, `gradcam_${safeFileSegment(patientId)}.jpg`);
  }

  return (
    <section className="space-y-5">
      <RiskBanner result={result} />

      <div className="grid animate-fade-in gap-5 xl:grid-cols-3">
        <Panel title="Original Image" tone={predictionMeta.color}>
          <div className="mt-5 aspect-[4/3] overflow-hidden rounded-md border border-clinical-border bg-black/20">
            {previewUrl ? (
              <img src={previewUrl} alt="Original oral cavity upload" className="h-full w-full object-contain" />
            ) : null}
          </div>
        </Panel>

        <Panel title="Grad-CAM Heatmap" tone={levelMeta.color}>
          <div className="mt-5 aspect-[4/3] overflow-hidden rounded-md border border-clinical-border bg-black/20">
            {gradcamSrc ? (
              <img src={gradcamSrc} alt="Grad-CAM heatmap" className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-sm text-clinical-muted">Heatmap unavailable</div>
            )}
          </div>
          <p className="mt-3 text-xs text-clinical-muted">
            Red regions indicate stronger model attention; blue regions indicate lower attention.
          </p>
        </Panel>

        <ProbabilityBars probabilities={result.probabilities} />
      </div>

      <div className="grid animate-fade-in gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Clinical Description" tone={predictionMeta.color}>
          <div className="mt-5 rounded-md border p-4" style={{ borderColor: predictionMeta.border, background: predictionMeta.bg }}>
            <p className="text-sm leading-7 text-slate-200">
              {result.clinical_description || "No clinical description was returned by the API."}
            </p>
          </div>
        </Panel>

        <Panel title="Risk Score & Recommendation" tone={levelMeta.color}>
          <div className="mt-5 grid gap-4 sm:grid-cols-[0.7fr_1fr]">
            <RiskGauge score={result.risk_score} level={result.risk_level} />
            <div className="rounded-md border p-4" style={{ borderColor: levelMeta.border, background: levelMeta.bg }}>
              <p className="font-mono text-xs uppercase tracking-[0.12em]" style={{ color: levelMeta.color }}>
                Recommendation
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-100">
                {result.recommendation || "No recommendation was returned by the API."}
              </p>
              <p className="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-slate-400">
                Report: {result.report_detail || "standard"}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Full Clinical Report" tone={levelMeta.color} className="animate-fade-in">
        <pre className="mt-5 max-h-[420px] overflow-auto rounded-md border border-clinical-border bg-[#030914] p-5 font-mono text-xs leading-6 text-slate-200">{result.final_report || "No report text was returned by the API."}</pre>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={handleReportDownload} className="download-button">
            Download Report .txt
          </button>
          <button
            type="button"
            onClick={handleHeatmapDownload}
            disabled={!result.gradcam_b64}
            className="download-button disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
          >
            Download Heatmap .jpg
          </button>
        </div>
      </Panel>
    </section>
  );
}

function App() {
  const [patientId, setPatientId] = useState("P001");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState({ status: "checking", detail: "Pinging FastAPI service..." });

  useEffect(() => {
    let ignore = false;

    async function ping() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!ignore) {
          setHealth({
            status: "online",
            detail: data.model || "FastAPI model service is healthy.",
          });
        }
      } catch {
        if (!ignore) {
          setHealth({
            status: "offline",
            detail: "Start the backend with: uvicorn api:app --reload",
          });
        }
      }
    }

    ping();
    const interval = window.setInterval(ping, 10000);
    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(selectedFile) {
    setError("");
    setResult(null);
    setFile(selectedFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(selectedFile));
  }

  async function handleAnalyse() {
    if (!file) {
      setError("Select an image before analysis.");
      return;
    }
    if (!patientId.trim()) {
      setError("Patient ID is required.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("patient_id", patientId.trim());

      const response = await fetch(`${API_BASE_URL}/analyse`, {
        method: "POST",
        body: formData,
      });

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error("The API returned a non-JSON response.");
      }

      if (!response.ok) {
        throw new Error(payload?.detail || payload?.error || `Analysis failed with HTTP ${response.status}.`);
      }
      if (payload?.error) {
        throw new Error(payload.error);
      }

      setResult(payload);
    } catch (analysisError) {
      setError(analysisError.message || "Analysis failed. Check the API server and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-clinical-bg text-slate-100">
      <div className="grid-overlay" />
      <div className="relative z-10 grid min-h-screen lg:grid-cols-[320px_minmax(0,1fr)]">
        <Sidebar patientId={patientId} setPatientId={setPatientId} health={health} />

        <main className="px-5 py-6 sm:px-8 lg:px-10">
          <header className="mb-6 border-b border-clinical-border pb-6">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-clinical-cyan">
                Clinical Screening Workspace
              </p>
              <h1 className="mt-3 font-mono text-3xl font-semibold tracking-normal text-slate-50 sm:text-4xl">
                Analyse oral lesion imagery with explainable AI
              </h1>
            </div>
          </header>

          <div className="space-y-7">
            <UploadSection
              file={file}
              previewUrl={previewUrl}
              patientId={patientId}
              setPatientId={setPatientId}
              onFileChange={handleFileChange}
              onAnalyse={handleAnalyse}
              loading={loading}
              error={error}
            />

            {loading ? <LoadingDashboard /> : null}
            {!loading && result ? (
              <ResultsDashboard result={result} previewUrl={previewUrl} patientId={patientId} />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
const root = window.__ORAL_DETECTION_ROOT__ || createRoot(rootElement);
window.__ORAL_DETECTION_ROOT__ = root;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
