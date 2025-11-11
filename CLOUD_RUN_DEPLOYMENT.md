# Google Cloud Run 배포 가이드

이 문서는 FastAPI 백엔드를 Google Cloud Run에 배포하는 방법을 안내합니다.

## 배포 방법 선택

두 가지 배포 방법이 있습니다:

### 🤖 방법 1: 자동 배포 (GitHub Actions) - 권장

```
[코드 수정] → [git push] → [자동 배포] ✨
```

- **장점**: 편리함, 일관성, 자동화
- **설정**: 초기 한 번만 GitHub Secrets 설정
- **가이드**: [GITHUB_ACTIONS_SETUP.md](GITHUB_ACTIONS_SETUP.md) 참고

### 🔧 방법 2: 수동 배포 (로컬에서 스크립트 실행)

```
[로컬에서 ./deploy-cloud-run.sh 실행] → [배포]
```

- **장점**: 간단, 빠른 시작
- **설정**: 로컬에 gcloud CLI 설치 필요
- **가이드**: 아래 내용 참고

---

**이미 GitHub Actions 설정이 완료되었다면**: main 브랜치에 push하기만 하면 자동 배포됩니다!

**처음 시작하시거나 빠르게 테스트하려면**: 아래 수동 배포 가이드를 따라하세요.

---

## 사전 요구사항

1. Google Cloud 계정 및 프로젝트
2. [gcloud CLI](https://cloud.google.com/sdk/docs/install) 설치
3. Docker 설치 (로컬 테스트용, 선택사항)
4. Supabase 프로젝트 (이미 설정됨)
5. Google Sheets API 인증 정보

## 환경 변수 설정

Cloud Run에 다음 환경 변수를 설정해야 합니다:

### 필수 환경 변수

| 변수 이름 | 설명 | 예시 |
|----------|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL | `https://jkptpedcpxssgfppzwor.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase 서비스 키 (service_role key) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `GOOGLE_SHEETS_CREDENTIALS_JSON` | Google Sheets API 인증 JSON (전체 JSON 문자열) | `{"type":"service_account",...}` |

### 선택 환경 변수

| 변수 이름 | 설명 | 기본값 | 예시 |
|----------|------|--------|------|
| `FRONTEND_URL` | 프론트엔드 URL (CORS 설정용) | `*` (모든 출처 허용) | `https://your-app.vercel.app` |
| `PORT` | 서버 포트 | `8080` (Cloud Run이 자동 설정) | `8080` |

## 배포 단계

### 1. Google Cloud 프로젝트 설정

```bash
# Google Cloud 로그인
gcloud auth login

# 프로젝트 ID 설정 (YOUR_PROJECT_ID를 실제 프로젝트 ID로 변경)
export PROJECT_ID=YOUR_PROJECT_ID
gcloud config set project $PROJECT_ID

# Container Registry API 활성화
gcloud services enable containerregistry.googleapis.com
gcloud services enable run.googleapis.com
```

### 2. 환경 변수 준비

Google Sheets 인증 JSON 파일을 환경 변수로 변환:

```bash
# google_sheets_credentials.json 파일이 있다면
export GOOGLE_SHEETS_CREDENTIALS_JSON=$(cat google_sheets_credentials.json | tr -d '\n')

# .env 파일에서 Supabase 정보 가져오기
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_KEY="your-supabase-service-key"

# 프론트엔드 URL 설정 (Vercel URL)
export FRONTEND_URL="https://your-frontend.vercel.app"
```

### 3. Docker 이미지 빌드 및 푸시

```bash
# 서비스 이름 설정
export SERVICE_NAME=warehouse-inventory-api

# Docker 이미지 빌드
docker build -t gcr.io/$PROJECT_ID/$SERVICE_NAME .

# Docker 이미지를 Google Container Registry에 푸시
docker push gcr.io/$PROJECT_ID/$SERVICE_NAME
```

또는 Cloud Build 사용 (더 간단):

```bash
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME
```

### 4. Cloud Run에 배포

```bash
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --set-env-vars "SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY,FRONTEND_URL=$FRONTEND_URL,GOOGLE_SHEETS_CREDENTIALS_JSON=$GOOGLE_SHEETS_CREDENTIALS_JSON" \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10
```

배포가 완료되면 서비스 URL이 표시됩니다 (예: `https://warehouse-inventory-api-xxxxxx-an.a.run.app`).

### 5. 배포 확인

```bash
# Health check
curl https://your-service-url.a.run.app/health

# 예상 응답:
# {"ok":true,"timestamp":"2024-01-15T10:30:00.000000Z"}
```

## 프론트엔드 연결

Vercel 프론트엔드에서 Cloud Run 백엔드를 사용하도록 환경 변수 설정:

### Vercel 환경 변수

1. Vercel 대시보드에서 프로젝트 선택
2. Settings → Environment Variables
3. 다음 변수 추가:

```
VITE_API_URL=https://your-service-url.a.run.app
```

4. 프론트엔드 재배포

## 로컬 테스트

Docker로 로컬에서 테스트:

```bash
# Docker 이미지 빌드
docker build -t warehouse-api-local .

# 컨테이너 실행
docker run -p 8080:8080 \
  -e SUPABASE_URL=$SUPABASE_URL \
  -e SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY \
  -e GOOGLE_SHEETS_CREDENTIALS_JSON="$GOOGLE_SHEETS_CREDENTIALS_JSON" \
  warehouse-api-local

# 테스트
curl http://localhost:8080/health
```

## 주의사항

### 데이터 영속성

⚠️ **중요**: 현재 설정에서는 `server/data/` 폴더의 파일들이 컨테이너 재시작 시 삭제됩니다.

- **임시 저장**: 스냅샷, 캐시 등은 컨테이너 메모리에만 저장
- **프로덕션 권장**: Google Cloud Storage 또는 Supabase Storage로 마이그레이션

### CORS 설정

- 개발 환경: `FRONTEND_URL`을 설정하지 않으면 모든 출처 허용 (`*`)
- 프로덕션: 반드시 `FRONTEND_URL`을 설정하여 특정 도메인만 허용

### 비용 최적화

- **메모리**: 512Mi로 시작, 필요시 조정
- **CPU**: 1 vCPU로 시작
- **최대 인스턴스**: 10개로 제한 (비용 관리)
- **요청당 과금**: 사용하지 않을 때는 과금되지 않음

## 배포 스크립트 사용

간편한 배포를 위해 `deploy-cloud-run.sh` 스크립트를 제공합니다:

```bash
# 스크립트에 실행 권한 부여
chmod +x deploy-cloud-run.sh

# 배포 실행
./deploy-cloud-run.sh
```

## 트러블슈팅

### 1. 배포 실패

```bash
# 로그 확인
gcloud run services logs read $SERVICE_NAME --region asia-northeast3 --limit 50
```

### 2. 환경 변수 확인

```bash
# 현재 설정된 환경 변수 보기
gcloud run services describe $SERVICE_NAME --region asia-northeast3 --format="value(spec.template.spec.containers[0].env)"
```

### 3. CORS 오류

- `FRONTEND_URL` 환경 변수가 정확한지 확인
- 프로토콜 포함 여부 확인 (https:// 필요)
- 끝에 슬래시(/) 없이 설정

### 4. Google Sheets 연결 실패

- `GOOGLE_SHEETS_CREDENTIALS_JSON`이 올바른 JSON 형식인지 확인
- Service Account에 Google Sheets API 권한이 있는지 확인

## 업데이트

코드 변경 후 재배포:

```bash
# 새 이미지 빌드 및 배포
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME && \
gcloud run deploy $SERVICE_NAME --image gcr.io/$PROJECT_ID/$SERVICE_NAME --region asia-northeast3
```

## 참고 자료

- [Google Cloud Run 문서](https://cloud.google.com/run/docs)
- [FastAPI 배포 가이드](https://fastapi.tiangolo.com/deployment/docker/)
- [gcloud CLI 참조](https://cloud.google.com/sdk/gcloud/reference/run)
