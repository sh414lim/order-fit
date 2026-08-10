# OrderFit — 레스토랑 발주 관리

영수증 사진을 발주 데이터로 정리하고, 업체별 지출·품목 단가·재고 사용량을 관리하기 위한 웹 프로토타입입니다.

## 실행

별도 설치 없이 `index.html`을 브라우저에서 열면 됩니다. 로컬 서버가 필요하다면 다음처럼 실행할 수 있습니다.

```bash
python3 -m http.server 8080
```

그 뒤 `http://localhost:8080`을 엽니다.

## 포함된 프로토타입 기능

- OCR 결과를 가정한 영수증 검토·확정 화면
- 업체별 누적 발주금액 및 품목별 단가 이력
- 재고 현황, 사용량 입력, 부족재고 알림
- 대시보드 지표와 발주 내역 검색

상세 제품·데이터·API 설계는 [docs/product-design.md](docs/product-design.md)에서 확인할 수 있습니다.

## Supabase 백엔드

운영용 PostgreSQL 스키마, 영수증 Storage 정책, 재고 원장과 영수증 확정 RPC를 [supabase](supabase) 폴더에 추가했습니다. 회원가입과 로그인은 Supabase 이메일 인증과 분리된 `orderfit_user_*` 계정·세션 테이블 및 Vercel 서버 API로 처리합니다. 실제 프로젝트 연결과 마이그레이션 적용 절차는 [docs/supabase-setup.md](docs/supabase-setup.md)를 참고하세요.
