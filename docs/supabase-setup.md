# Supabase 백엔드 설정

## 포함된 백엔드 구성

- [초기 마이그레이션](../supabase/migrations/20260809000000_orderfit_initial.sql)
- Supabase Auth 기반 사용자 프로필과 조직 멤버십
- 조직 단위 RLS 정책 및 관리자/매니저 권한
- 업체, 품목, 업체별 품목 별칭, 영수증, OCR 행, 재고 원장, 감사 로그
- 비공개 `receipts` Storage 버킷과 조직별 파일 접근 정책
- 영수증 확정 RPC: `confirm_receipt(receipt_id)`
- 업체 월별 합계·현재고 조회 뷰

## 로컬 설정

```bash
supabase init
supabase start
supabase db reset
```

이미 Supabase CLI 프로젝트를 연결했다면 다음을 사용한다.

```bash
supabase link --project-ref <project-ref>
supabase db push
```

## Vercel 환경 변수

클라이언트에는 Publishable/Anon 키만 제공하고, `service_role` 키는 브라우저와 Git에 절대 노출하지 않는다.

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only>
```

## 영수증 처리 흐름

1. 로그인한 사용자가 `receipts/<organization-id>/<receipt-id>/original.jpg`에 사진을 업로드한다.
2. `receipts` 테이블에 `uploaded` 상태 레코드를 만들고 `image_path`를 저장한다.
3. Edge Function 또는 서버 작업자가 OCR을 수행해 `ocr_payload`, `ocr_confidence`, `receipt_lines`를 작성하고 상태를 `review_required`로 바꾼다.
4. 관리자는 품목·수량·금액을 수정한다.
5. 관리자는 `rpc('confirm_receipt', { target_receipt_id })`를 호출한다.
6. 함수는 영수증을 확정하고, 품목 행에서 재고 입고 원장을 생성하며 감사 로그를 남긴다.

## OCR 연동 경계

OCR 공급사 키와 실제 프로젝트 URL은 아직 제공되지 않았으므로, OCR 호출은 다음 서버 측 환경 변수로 연결한다.

```text
OCR_PROVIDER_API_KEY=<server-only>
OCR_PROVIDER_MODEL=<provider-model>
```

OCR 호출은 Edge Function 또는 Vercel Serverless Function에서 수행한다. 비밀 키를 브라우저 코드에 넣지 않는다.

## 보안 원칙

- 모든 공개 스키마 테이블에서 RLS를 활성화했다.
- 테이블·Storage 접근은 `organization_members`의 조직 멤버십으로 제한된다.
- 확정·업체/품목 마스터 수정·재고 조정은 관리자 또는 매니저 역할만 가능하다.
- 영수증 원본은 공개 버킷이 아닌 private Storage 버킷에 저장한다.
- RLS 정책은 `auth.uid()`가 없는 요청을 허용하지 않도록 설계한다. [Supabase RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage 접근 제어 문서](https://supabase.com/docs/guides/storage/security/access-control)를 참고한다.
