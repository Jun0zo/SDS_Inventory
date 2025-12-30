# GitHub Actions 자동 배포 설정 가이드

GitHub에 push하면 자동으로 Google Cloud Run에 배포되도록 설정하는 방법입니다.

## 개요

```
[코드 수정] → [Git push to main] → [GitHub Actions 자동 실행]
                                            ↓
                                    [Docker 이미지 빌드]
                                            ↓
                                    [Cloud Run 배포]
                                            ↓
                                    [Health check 테스트]
```

## 사전 요구사항

1. Google Cloud 프로젝트
2. GitHub 리포지토리
3. 관리자 권한 (GitHub Secrets 설정용)

## 1단계: Google Cloud Service Account 생성

### 1-1. Service Account 생성

```bash
# Google Cloud 로그인
gcloud auth login

# 프로젝트 설정
export PROJECT_ID=your-gcp-project-id
gcloud config set project $PROJECT_ID

# Service Account 생성
gcloud iam service-accounts create github-actions-deployer \
  --display-name="GitHub Actions Deployer"
```

### 1-2. 권한 부여

```bash
# Service Account에 필요한 권한 부여
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### 1-3. JSON Key 생성

```bash
# JSON 키 파일 다운로드
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com

# 키 파일 내용 확인 (복사용)
cat github-actions-key.json
```

**중요**: 이 JSON 파일 내용을 복사해두세요. GitHub Secrets에 등록할 때 필요합니다.

## 2단계: GitHub Secrets 설정

### 2-1. GitHub 리포지토리 설정 페이지로 이동

1. GitHub 리포지토리 페이지 접속
2. **Settings** 탭 클릭
3. 왼쪽 사이드바에서 **Secrets and variables** → **Actions** 클릭
4. **New repository secret** 버튼 클릭

### 2-2. 필수 Secrets 추가

다음 Secrets를 하나씩 추가합니다:

#### 1. GCP_PROJECT_ID

```
Name: GCP_PROJECT_ID
Value: your-gcp-project-id
```

예: `samsung-sds-471203`

#### 2. GCP_SA_KEY

```
Name: GCP_SA_KEY
Value: (github-actions-key.json 파일의 전체 내용)
```

전체 JSON을 그대로 붙여넣기:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "github-actions-deployer@your-project-id.iam.gserviceaccount.com",
  ...
}
```

#### 3. SUPABASE_URL

```
Name: SUPABASE_URL
Value: https://jkptpedcpxssgfppzwor.supabase.co
```

#### 4. SUPABASE_SERVICE_KEY

```
Name: SUPABASE_SERVICE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

`.env` 파일에서 `SUPABASE_SERVICE_KEY` 값을 복사

#### 5. GOOGLE_SHEETS_CREDENTIALS_JSON

```
Name: GOOGLE_SHEETS_CREDENTIALS_JSON
Value: (google_sheets_credentials.json 파일의 전체 내용)
```

전체 JSON을 그대로 붙여넣기 (줄바꿈 포함):
```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  ...
}
```

#### 6. FRONTEND_URL (선택사항)

```
Name: FRONTEND_URL
Value: https://your-frontend.vercel.app
```

CORS 설정용. 설정하지 않으면 모든 출처 허용 (`*`)

## 3단계: 배포 테스트

### 3-1. 워크플로우 파일 확인

`.github/workflows/deploy.yml` 파일이 있는지 확인:

```bash
ls -la .github/workflows/deploy.yml
```

### 3-2. Git push로 배포 트리거

```bash
# 변경사항 커밋
git add .
git commit -m "feat: Add GitHub Actions auto-deploy"

# main 브랜치에 push
git push origin main
```

### 3-3. 배포 진행 상황 확인

1. GitHub 리포지토리 페이지 접속
2. **Actions** 탭 클릭
3. 최근 워크플로우 실행 확인
4. 로그를 보며 진행 상황 모니터링

성공 시 다음과 같은 메시지가 표시됩니다:
```
✅ Health check passed!
Service deployed to: https://warehouse-inventory-api-xxxxxx-an.a.run.app
```

## 배포 트리거 조건

다음 조건일 때 자동 배포가 실행됩니다:

1. **main 브랜치에 push**
2. **다음 파일/폴더 중 하나가 변경됨**:
   - `server/**` - 백엔드 코드
   - `Dockerfile` - Docker 설정
   - `.github/workflows/deploy.yml` - 워크플로우 파일

**프론트엔드만 변경** (`src/**`)한 경우에는 배포가 트리거되지 않습니다.

## 배포 과정

1. **코드 체크아웃**: GitHub에서 최신 코드 다운로드
2. **GCP 인증**: Service Account로 Google Cloud 인증
3. **Docker 빌드**: 컨테이너 이미지 생성
4. **이미지 푸시**: Google Container Registry에 업로드
5. **Cloud Run 배포**: 새 이미지로 서비스 업데이트
6. **Health Check**: `/health` 엔드포인트 테스트

전체 과정은 약 **3-5분** 소요됩니다.

## 트러블슈팅

### 1. 권한 오류 (Permission Denied)

**증상**: "Permission denied" 또는 "Forbidden" 오류

**해결**:
```bash
# Service Account 권한 재확인
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com"

# 필요 시 권한 다시 부여 (1-2 단계 참고)
```

### 2. Secret 값 오류

**증상**: "Invalid credentials" 또는 "Authentication failed"

**해결**:
- GitHub Secrets에서 값 확인
- JSON 형식이 올바른지 확인 (줄바꿈, 특수문자 포함)
- 복사할 때 앞뒤 공백이 들어가지 않았는지 확인

### 3. 배포는 성공했지만 Health Check 실패

**증상**: 배포는 완료되었으나 마지막 health check 단계 실패

**해결**:
```bash
# Cloud Run 로그 확인
gcloud run services logs read warehouse-inventory-api --region asia-northeast3 --limit 50

# 환경 변수 확인
gcloud run services describe warehouse-inventory-api --region asia-northeast3
```

### 4. 워크플로우가 실행되지 않음

**증상**: push했지만 Actions 탭에 아무것도 표시되지 않음

**해결**:
- `.github/workflows/deploy.yml` 파일이 main 브랜치에 있는지 확인
- `server/` 폴더나 `Dockerfile`이 변경되었는지 확인
- GitHub Actions가 리포지토리에 활성화되어 있는지 확인

## 보안 주의사항

### JSON Key 파일 관리

- ✅ GitHub Secrets에만 저장
- ✅ 로컬에서 생성 후 즉시 삭제 권장
- ❌ 절대 Git에 커밋하지 말 것
- ❌ `.env` 파일이나 코드에 하드코딩 금지

### Service Account 권한

- 필요한 최소 권한만 부여 (Principle of Least Privilege)
- 정기적으로 사용하지 않는 Key 삭제
- Key 순환 정책 수립 (6개월~1년마다 재생성)

## 수동 배포와 비교

| 항목 | 수동 배포 | 자동 배포 (GitHub Actions) |
|------|----------|---------------------------|
| 배포 방법 | `./deploy-cloud-run.sh` 실행 | `git push` |
| 환경 변수 | 로컬 터미널에서 설정 | GitHub Secrets |
| 일관성 | 로컬 환경에 따라 다름 | 항상 동일한 환경 |
| 편의성 | 수동 실행 필요 | 자동 실행 |
| 로그 | 터미널 출력 | GitHub Actions 로그 |

## 다음 단계

자동 배포가 설정되었습니다! 이제:

1. **코드 변경** → **Git push** → **자동 배포** 흐름이 완성되었습니다
2. 프론트엔드 Vercel도 GitHub 연동하여 전체 스택 자동 배포 가능
3. 필요 시 staging 브랜치 추가하여 다단계 배포 구성 가능

## 참고 자료

- [GitHub Actions 문서](https://docs.github.com/en/actions)
- [Google Cloud Run with GitHub Actions](https://cloud.google.com/run/docs/continuous-deployment-with-github-actions)
- [Service Account 모범 사례](https://cloud.google.com/iam/docs/best-practices-service-accounts)
