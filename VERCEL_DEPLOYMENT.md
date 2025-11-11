# Vercel 배포 가이드

이 프로젝트는 Vercel에 배포할 수 있도록 설정되어 있습니다.

## 🚀 배포 방법

### 1. Vercel 프로젝트 생성

1. [Vercel 대시보드](https://vercel.com/dashboard) 접속
2. "Add New..." → "Project" 클릭
3. GitHub 저장소 연결 (Jun0zo/SDS_Inventory)
4. Import 클릭

### 2. 환경 변수 설정

Vercel 프로젝트 설정에서 다음 환경 변수를 추가하세요:

#### 필수 환경 변수
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
GOOGLE_SHEETS_CREDENTIALS_JSON={"type":"service_account","project_id":"..."}
```

⚠️ **중요**: `GOOGLE_SHEETS_CREDENTIALS_JSON`은 JSON을 한 줄로 만들어야 합니다 (개행 문자 제거).

#### 환경 변수 추가 방법
1. Vercel 프로젝트 → Settings → Environment Variables
2. 각 변수 이름과 값 입력
3. Production, Preview, Development 체크
4. Save

### 3. 빌드 설정 (자동 감지됨)

`vercel.json`에 이미 설정되어 있습니다:
- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 4. 배포

#### 자동 배포
- `dev` 브랜치에 push하면 자동으로 Preview 배포
- `main` 브랜치에 merge하면 자동으로 Production 배포

#### 수동 배포 (CLI)
```bash
# Vercel CLI 설치
npm i -g vercel

# 로그인
vercel login

# Preview 배포
vercel

# Production 배포
vercel --prod
```

## 📁 프로젝트 구조

```
SDS_Inventory2/
├── api/                      # Vercel Serverless Functions
│   ├── index.py             # API Gateway
│   └── requirements.txt     # Python dependencies
├── server/                   # FastAPI backend
│   ├── app.py              # Main application
│   ├── sheets.py           # Google Sheets integration
│   └── ...
├── src/                     # React frontend
│   ├── App.tsx
│   ├── components/
│   └── ...
├── vercel.json              # Vercel configuration
└── package.json             # Node dependencies
```

## 🔧 Vercel 설정 파일 (`vercel.json`)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index"
    }
  ],
  "functions": {
    "api/**/*.py": {
      "runtime": "python3.9"
    }
  }
}
```

## 🌐 API 엔드포인트

배포 후 API는 다음 경로로 접근할 수 있습니다:
- Production: `https://your-project.vercel.app/api/*`
- Preview: `https://your-project-xxx.vercel.app/api/*`

### 주요 엔드포인트
- `GET /api/health` - 헬스 체크
- `GET /api/config` - 서버 설정 조회
- `PUT /api/config` - 서버 설정 업데이트
- `POST /api/sync/wms` - WMS 데이터 동기화
- `POST /api/test-connection` - 연결 테스트
- `GET /api/snapshot/latest/{warehouse_code}` - 최신 스냅샷 조회

## 🔐 보안 고려사항

### Secrets 관리
- ✅ `google_sheets_credentials.json`은 Git에서 제외됨
- ✅ 환경 변수로 credentials 관리
- ✅ Vercel Environment Variables에 안전하게 저장

### CORS 설정
FastAPI 앱(`server/app.py`)의 CORS 설정을 확인하세요:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-domain.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 📊 Supabase 연결

Supabase 프로젝트 설정:
1. [Supabase Dashboard](https://app.supabase.com/) 접속
2. 프로젝트 Settings → API
3. Project URL과 anon public key 복사
4. Vercel 환경 변수에 추가

## 🐛 트러블슈팅

### Build 실패
```bash
# 로컬에서 빌드 테스트
npm run build

# TypeScript 에러 확인
npm run lint
```

### API 연결 실패
1. Vercel Functions 로그 확인
2. Environment Variables 확인
3. CORS 설정 확인

### Serverless Function Timeout
- Vercel Free tier: 10초 제한
- Pro tier: 60초 제한
- 긴 작업은 비동기로 처리 권장

## 📈 모니터링

Vercel 대시보드에서 확인 가능:
- **Analytics**: 방문자 통계
- **Logs**: Runtime logs
- **Speed Insights**: 성능 메트릭
- **Functions**: Serverless function 실행 로그

## 🔄 개발 워크플로우

1. **Local Development**
   ```bash
   npm run dev        # Frontend (Vite)
   cd server && uvicorn app:app --reload  # Backend
   ```

2. **Preview Deployment** (dev 브랜치)
   ```bash
   git checkout dev
   git add .
   git commit -m "feat: new feature"
   git push origin dev
   ```

3. **Production Deployment** (main 브랜치)
   ```bash
   git checkout main
   git merge dev
   git push origin main
   ```

## 📚 참고 자료

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Python Runtime](https://vercel.com/docs/functions/serverless-functions/runtimes/python)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html#vercel)

