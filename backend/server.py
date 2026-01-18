from fastapi import FastAPI, APIRouter, HTTPException, status
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Literal
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class ProductBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nome: str
    marca: str
    categoria: Literal["Perfumes", "Roupas"]
    loja: str
    quantidade: int = Field(ge=0)
    limite_minimo: int = Field(default=5, ge=0)

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nome: Optional[str] = None
    marca: Optional[str] = None
    categoria: Optional[Literal["Perfumes", "Roupas"]] = None
    loja: Optional[str] = None
    quantidade: Optional[int] = Field(default=None, ge=0)
    limite_minimo: Optional[int] = Field(default=None, ge=0)

class ProductOut(ProductBase):
    id: str
    created_at: datetime
    updated_at: datetime

class LowStockAlerts(BaseModel):
    total_alertas: int
    produtos: List[ProductOut]

class CategorySummary(BaseModel):
    categoria: str
    total_itens: int
    total_alertas: int

class LojaSummary(BaseModel):
    loja: str
    total_itens: int
    total_alertas: int

class DashboardSummary(BaseModel):
    total_produtos: int
    total_itens: int
    total_alertas: int
    por_categoria: List[CategorySummary]
    por_loja: List[LojaSummary]

def _parse_datetime_fields(doc: Dict[str, Any]) -> Dict[str, Any]:
    for field in ("created_at", "updated_at", "timestamp"):
        if field in doc and isinstance(doc[field], str):
            try:
                doc[field] = datetime.fromisoformat(doc[field])
            except ValueError:
                pass
    return doc

def _serialize_datetime_fields(doc: Dict[str, Any]) -> Dict[str, Any]:
    for field in ("created_at", "updated_at", "timestamp"):
        if field in doc and isinstance(doc[field], datetime):
            doc[field] = doc[field].isoformat()
    return doc

@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    doc = _serialize_datetime_fields(status_obj.model_dump())
    await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        _parse_datetime_fields(check)
    return [StatusCheck(**item) for item in status_checks]

@api_router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(product_in: ProductCreate):
    now = datetime.now(timezone.utc)
    product_id = str(uuid.uuid4())
    product_data = product_in.model_dump()
    product_doc: Dict[str, Any] = {
        "id": product_id,
        **product_data,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.products.insert_one(product_doc)
    return ProductOut(id=product_id, created_at=now, updated_at=now, **product_data)

@api_router.get("/products", response_model=List[ProductOut])
async def list_products(categoria: Optional[str] = None, loja: Optional[str] = None):
    query: Dict[str, Any] = {}
    if categoria:
        query["categoria"] = categoria
    if loja:
        query["loja"] = loja

    docs = await db.products.find(query, {"_id": 0}).to_list(1000)
    products: List[ProductOut] = []
    for doc in docs:
        _parse_datetime_fields(doc)
        products.append(ProductOut(**doc))
    return products

@api_router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(product_id: str):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado")
    _parse_datetime_fields(doc)
    return ProductOut(**doc)

@api_router.put("/products/{product_id}", response_model=ProductOut)
async def update_product(product_id: str, product_update: ProductUpdate):
    existing = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado")

    update_data = {k: v for k, v in product_update.model_dump(exclude_unset=True).items() if v is not None}
    now = datetime.now(timezone.utc)

    if update_data:
        update_data["updated_at"] = now.isoformat()
        await db.products.update_one({"id": product_id}, {"$set": update_data})

    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado")

    _parse_datetime_fields(updated)
    return ProductOut(**updated)

@api_router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: str):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado")
    return None

@api_router.get("/alerts/low-stock", response_model=LowStockAlerts)
async def get_low_stock_alerts():
    docs = await db.products.find({}, {"_id": 0}).to_list(1000)
    low_stock_docs: List[Dict[str, Any]] = []
    for doc in docs:
        quantidade = int(doc.get("quantidade", 0))
        limite_minimo = int(doc.get("limite_minimo", 0))
        if quantidade <= limite_minimo:
            _parse_datetime_fields(doc)
            low_stock_docs.append(doc)

    produtos = [ProductOut(**doc) for doc in low_stock_docs]
    return LowStockAlerts(total_alertas=len(produtos), produtos=produtos)

@api_router.get("/dashboard/summary", response_model=DashboardSummary)
async def get_dashboard_summary():
    docs = await db.products.find({}, {"_id": 0}).to_list(1000)

    total_produtos = len(docs)
    total_itens = 0
    total_alertas = 0

    categoria_stats: Dict[str, Dict[str, int]] = {}
    loja_stats: Dict[str, Dict[str, int]] = {}

    for doc in docs:
        quantidade = int(doc.get("quantidade", 0))
        limite_minimo = int(doc.get("limite_minimo", 0))
        categoria = doc.get("categoria", "Desconhecida")
        loja = doc.get("loja", "Sem loja")

        total_itens += quantidade
        is_alert = quantidade <= limite_minimo
        if is_alert:
            total_alertas += 1

        cat_entry = categoria_stats.setdefault(categoria, {"total_itens": 0, "total_alertas": 0})
        cat_entry["total_itens"] += quantidade
        if is_alert:
            cat_entry["total_alertas"] += 1

        loja_entry = loja_stats.setdefault(loja, {"total_itens": 0, "total_alertas": 0})
        loja_entry["total_itens"] += quantidade
        if is_alert:
            loja_entry["total_alertas"] += 1

    por_categoria = [
        CategorySummary(categoria=cat, total_itens=data["total_itens"], total_alertas=data["total_alertas"])
        for cat, data in categoria_stats.items()
    ]

    por_loja = [
        LojaSummary(loja=loja, total_itens=data["total_itens"], total_alertas=data["total_alertas"])
        for loja, data in loja_stats.items()
    ]

    return DashboardSummary(
        total_produtos=total_produtos,
        total_itens=total_itens,
        total_alertas=total_alertas,
        por_categoria=por_categoria,
        por_loja=por_loja,
    )

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
