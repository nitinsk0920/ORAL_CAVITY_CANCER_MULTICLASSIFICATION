"""Legacy Streamlit entrypoint replaced by the React frontend.

Run the FastAPI backend with:
    uvicorn api:app --reload

Run the React app from ./frontend with:
    npm install
    npm run dev
"""

from pathlib import Path


FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"


def main() -> None:
    print("The Streamlit UI has been replaced by the React frontend.")
    print(f"Frontend directory: {FRONTEND_DIR}")
    print("Backend:  uvicorn api:app --reload")
    print("Frontend: cd frontend && npm install && npm run dev")


if __name__ == "__main__":
    main()
