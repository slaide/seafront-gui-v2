# setup venv (pydantic is not compatible with python3.14 currently)
uv venv --python 3.13
# install deps
uv pip install "fastapi==0.115.2" "uvicorn==0.34.2" "pydantic==2.11.3" websocket

echo "run server with $ uv run python3 server.py"
