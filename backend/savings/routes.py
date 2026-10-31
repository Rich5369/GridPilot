from fastapi import APIRouter
from backend.eia.retail import service
from backend.savings.catalog import CATALOG
from backend.savings.models import SavingsRequest, SavingsResponse
from backend.savings.service import build_recommendations

router = APIRouter(prefix='/api/savings', tags=['savings'])

@router.get('/catalog')
def catalog():
    return {'version':'1', 'categories':list(CATALOG.values())}

@router.post('/recommendations', response_model=SavingsResponse)
async def recommendations(request: SavingsRequest):
    return await build_recommendations(request, service)
