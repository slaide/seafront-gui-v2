import asyncio
from pydantic import BaseModel
from hypercorn.asyncio import serve
from hypercorn.config import Config
from fastapi import FastAPI
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
    config = Config()

    config.bind = [ f"{settings.host}:{settings.port}" ]

    # send access logs to stdout
    config.accesslog = "-"
    # (optionally) set a format string
    config.access_log_format = ( '"%(r)s" %(s)s' )
    # make sure info-level logs appear
    config.loglevel = "info"

    asyncio.run(serve(app, config)) # type: ignore
