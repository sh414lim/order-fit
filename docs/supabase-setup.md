# Supabase 백엔드 설정

## 포함된 백엔드 구성

- [초기 마이그레이션](../supabase/migrations/20260810000000_timefit_initial.sql)
- Supabase Auth 기반 사용자 프로필과 조직 멤버십
- 조직 단위 RLS 정책 및 관리자/매니저 권한
- 업체, 품목, 업체별 품목 별칭, 영수증, OCR 행, 재고 원장, 감사 로그
- 비공개 `timefit_receipts` Storage 버킷과 조직별 파일 접근 정책
- 영수증 확정 RPC: `timefit_confirm_receipt(receipt_id)`
- 업체 월별 합계·현재고 조회 뷰
- `orderfit_user_profiles`, `orderfit_user_roles` 기반의 별도 사용자·역할 모델

## 기존 프로젝트 공존 규칙

현재 연결된 `bro-gym` 프로젝트에 추가 적용하는 구조다. 발주 도메인 테이블·함수·뷰·Storage 버킷은 `timefit_`, 사용자 프로필·역할 테이블과 역할 RPC는 `orderfit_user_` 접두사를 사용한다. SQL 식별자에서 하이픈은 매번 따옴표가 필요하므로 `timefit-` 대신 `timefit_`을 사용한다.

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

## Auth 리디렉션 설정

Supabase Dashboard → Authentication → URL Configuration에서 현재 OrderFit 도메인을 **Additional Redirect URLs**에 추가한다.

```text
https://orderfit-omega.vercel.app
```

기존 `bro-gym`의 Site URL은 그대로 유지한다. OrderFit 회원가입은 `emailRedirectTo`로 현재 OrderFit 도메인을 요청하므로, 위 URL만 추가하면 기존 서비스의 기본 인증 흐름을 바꾸지 않는다.

## 이메일 인증 없이 관리자 회원가입 사용

OrderFit의 사용자·권한 데이터는 `orderfit_user_profiles`, `orderfit_user_roles`로 분리된다. 첫 매장을 생성한 사용자는 `admin` 역할을 받으며, 관리자는 `orderfit_user_assign_role` RPC로 같은 매장의 다른 사용자에게 `manager`, `kitchen`, `hall`, `staff` 역할을 줄 수 있다.

Supabase의 `Enable email confirmations` 설정은 **프로젝트 전체**에 적용된다. 현재 프로젝트는 `bro-gym`과 공유되므로 이 옵션을 끄면 기존 gym 회원가입에도 이메일 인증이 적용되지 않는다. 영향이 허용되는 경우에만 Supabase Dashboard → Authentication → Providers → Email에서 `Confirm email`을 끈다.

## 영수증 처리 흐름

1. 로그인한 사용자가 `timefit_receipts/<organization-id>/<receipt-id>/original.jpg`에 사진을 업로드한다.
2. `timefit_receipts` 테이블에 `uploaded` 상태 레코드를 만들고 `image_path`를 저장한다.
3. Edge Function 또는 서버 작업자가 OCR을 수행해 `ocr_payload`, `ocr_confidence`, `receipt_lines`를 작성하고 상태를 `review_required`로 바꾼다.
4. 관리자는 품목·수량·금액을 수정한다.
5. 관리자는 `rpc('timefit_confirm_receipt', { target_receipt_id })`를 호출한다.
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
- 테이블·Storage 접근은 `orderfit_user_roles`의 조직 멤버십과 활성 사용자 상태로 제한된다.
- 확정·업체/품목 마스터 수정·재고 조정은 관리자 또는 매니저 역할만 가능하다.
- 영수증 원본은 공개 버킷이 아닌 private Storage 버킷에 저장한다.
- RLS 정책은 `auth.uid()`가 없는 요청을 허용하지 않도록 설계한다. [Supabase RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage 접근 제어 문서](https://supabase.com/docs/guides/storage/security/access-control)를 참고한다.
