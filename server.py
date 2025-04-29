from pydantic import BaseModel
import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Use Pydantic to manage settings
class Settings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000

settings = Settings()

# Create a Starlette application and mount static files
app = FastAPI()

app.mount("/", StaticFiles(directory="./static", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host=settings.host, port=settings.port)
