# Kiosk authentication investigation (v1.2.6)

## 결론

Windows v1.2.6의 `KIOSK_AUTH_REQUIRED`는 Firebase SDK 오류가 아니라
`kiosk-runtime-auth.js`가 직접 생성하는 일반 `Error`다. `authenticate()`가 실행되는
시점에 Firebase Auth의 `currentUser`가 없고, preload IPC가 반환하는 custom token도
없으면 발생한다.

운영 packaged 앱에 누락된 입력은 main 프로세스 시작 시점의
`PJ_KIOSK_FIREBASE_CUSTOM_TOKEN` 환경변수다. 저장소에는 이 값을 생성, 설치,
영구 저장 또는 갱신하는 절차가 없다. electron-builder 설정도 이 값을 빌드 시
치환하거나 installer에 포함하지 않는다. 따라서 일반적인 설치/실행에서는 IPC
bridge는 존재하지만 반환할 credential은 없다.

별개의 타이밍 위험도 확인됐다. Firebase compat Auth는 persistence 복원을
비동기로 초기화하지만 `authenticate()`는 `authStateReady()` 또는
`onAuthStateChanged()`를 기다리지 않고 `currentUser`를 즉시 한 번 읽는다.
기존 세션이 실제로 저장돼 있어도 복원 전 호출이면 같은 오류가 날 수 있다.

## 운영 증상과 근거

- 앱 1.2.6, `packaged: true`, Firebase project `papajohns-kiosk`
- store `pangyo2-techno-valley`, kiosk `mobile-01`
- Firebase 초기화와 remote module load는 성공
- `authentication-attempt` 다음 `authentication-failed`
- `errorName: Error`, `errorCode: null`, `errorMessage: KIOSK_AUTH_REQUIRED`
- channel 생성과 presence write 전에 중단되며 15초 재시도마다 반복

일반 `new Error('KIOSK_AUTH_REQUIRED')`에는 Firebase `FirebaseError`의 `code`
속성이 없으므로 진단기의 `errorCode`가 `null`이 된다.

## `authenticate()` 실행 흐름

입력은 `firebase`, 선택적 `storeId`, `kioskId`, 그리고 기본값
`window.kioskIdentity`인 `identityBridge`다.

1. `firebase.auth()` compat 인스턴스를 얻고 `currentUser`를 즉시 읽는다.
2. user가 없고 bridge에 `consumeCustomToken()`이 있으면 호출한다.
3. 반환값이 truthy이면 `firebase.auth().signInWithCustomToken(customToken)`을
   호출하고 결과 user를 사용한다. 로컬 변수는 `finally`에서 비운다.
4. user가 여전히 없으면 `KIOSK_AUTH_REQUIRED`를 throw한다.
5. user가 있으면 `getIdTokenResult(true)`로 강제 갱신한 custom claims를 읽는다.
6. role이 `kiosk`이고 claim의 store/kiosk가 기대값과 일치해야 성공한다.
   불일치하면 sign-out 후 `KIOSK_IDENTITY_MISMATCH`를 throw한다.
7. 성공 시 claims에서 정규화한 runtime identity를 반환한다.

함수는 localStorage, sessionStorage, 설정 파일 또는 renderer 환경변수를 읽지
않는다. 익명/계정 로그인 fallback과 packaged/dev 분기도 없다. Auth persistence
종류를 명시적으로 설정하지 않으며 Firebase compat의 기본 browser persistence에
의존한다.

### return/throw 표

| 위치 | 조건 | 결과 |
|---|---|---|
| SDK 검사 | `firebase.auth` 없음 | `KIOSK_AUTH_SDK_UNAVAILABLE` |
| user 검사 | `currentUser` 없음 + token 없음/bridge 없음 | `KIOSK_AUTH_REQUIRED` |
| custom token 로그인 | SDK가 token 거절 | Firebase `auth/...` 오류 전파 |
| claims 검사 | role/identity claim 불일치 | sign-out 후 `KIOSK_IDENTITY_MISMATCH` |
| 완료 | kiosk claims 일치 | `{uid, role, storeId, kioskId}` |

## `KIOSK_AUTH_REQUIRED` 검색 결과

| 파일/함수/라인(v1.2.6 기준) | 발생 조건 | 호출자와 표시 결과 | 재시도 변화 |
|---|---|---|---|
| `kiosk-runtime-auth.js`, `authenticate`, 기존 38-40 | user와 token 로그인 결과가 모두 없음 | `index.html:connectKioskRuntime`; `authentication-failed`, 일반 Error 메시지 | 외부에서 token을 새로 공급하거나 Auth 복원이 끝나지 않으면 동일 |

문자열의 유일한 실행 정의와 throw는 위 위치다. 테스트와 이 문서를 제외하면 다른
발생 지점은 없다. throw 직전 코드는 의미상 `if (!user) throw new
Error('KIOSK_AUTH_REQUIRED')`다.

## credential 공급 추적

| 입력 | 생성 | 저장 | 읽기 | packaged/운영 주입 | 없을 때 | 민감성 |
|---|---|---|---|---|---|---|
| Firebase custom token | 저장소에 없음(관리자 SDK 발급 필요) | main 메모리에 1회성 보관 | `process.env.PJ_KIOSK_FIREBASE_CUSTOM_TOKEN` | 빌드/installer 주입 없음 | `KIOSK_AUTH_REQUIRED` | 비밀 |
| preload bridge | `desktop/preload.js` | 저장 안 함 | IPC invoke | packaged 포함 | bridge 부재 시 token 경로 없음 | 비밀값을 운반 |
| Firebase currentUser | 성공 로그인 후 SDK가 관리 | Firebase browser persistence | `firebase.auth().currentUser` | SDK asset 포함 | token 경로 시도 | UID/토큰 민감 |
| device ID | 사용자 localStorage `pjDeviceId` 또는 `mobile-01` | localStorage | `index.html` | 포함되나 인증 credential 아님 | 기본 kiosk ID | 식별값 |

main은 환경변수를 모듈 로드 시 한 번 읽는다. IPC 최초 호출은 값을 반환한 뒤 즉시
메모리에서 null로 만든다. 로그인 실패 뒤에도 같은 프로세스의 재연결은 token을
다시 받을 수 없다. token 저장 파일, device registration, refresh/renewal,
관리자 발급 endpoint는 없다.

## 개발 환경과 packaged 환경

| 항목 | 브라우저 개발 | Electron 개발 | Electron packaged |
|---|---|---|---|
| protocol/origin | 보통 HTTP(S), 실행 방식 의존 | `file://` | `file://` |
| preload/IPC | 없음 | 있음 | 있음 |
| 환경변수 | renderer 공급 경로 없음 | shell에서 main에 직접 설정 가능 | 실행 서비스/shortcut이 설정해야 하나 현재 절차 없음 |
| credential | 기존 브라우저 Auth 저장소만 가능 | env token 또는 Electron 저장소의 기존 user | env token 또는 Electron 저장소의 기존 user |
| persistence 저장소 | origin별 IndexedDB/local storage | Electron `file://` profile | Electron `file://` profile |
| user data | 브라우저 profile | Electron app userData | Electron app userData |
| 최초 실행 | 브라우저에 우연히 로그인 상태가 있을 수 있음 | env 설정 시 통과 가능 | token/기존 user가 없어 실패 |
| 업데이트 | 브라우저 profile 유지 | 동일 app userData면 유지 가능 | appId/userData가 같으면 보통 유지되지만 보장 테스트 없음 |
| Auth 복원 시점 | 비동기 | 비동기 | 비동기 |

개발에서 드러나지 않을 수 있는 이유는 개발 shell에 환경변수가 있거나 동일 origin/profile에
기존 로그인 상태가 남아 있기 때문이다. 코드상 dev 전용 fallback은 전혀 없다.
`file://`에서 Firebase가 선택하는 실제 persistence backend와 installer 업데이트
후 보존은 Windows 실기기 검증이 필요하다. 저장소만으로 “항상 유지된다”고 확정할 수
없다.

## 확정 원인과 범위

직접 원인은 `currentUser === null`인 상태에서 IPC가 null token을 반환한 것이다.
운영 입력 누락은 `PJ_KIOSK_FIREBASE_CUSTOM_TOKEN`을 app 시작 환경에 제공하는
배포/등록 절차가 없다는 점이다. 복원 대기 부재는 동일 증상을 만들 수 있는 독립적인
코드 결함이며, 운영 로그만으로 두 원인의 기여도를 완전히 분리할 수 없어서 새 진단은
`credentialSource`, `credentialPresent`, `authReadyState`를 기록한다.

재연결은 프로세스를 재시작하거나 환경을 바꾸지 않고 같은 함수를 15초 뒤 호출한다.
null 환경 입력은 계속 null이고, 1회 소비된 token은 복구되지 않으므로 해결되지 않는다.

## 진단 정밀화

인증 결정은 token 원문 없이 다음 필드만 남긴다:
`authMode`, `hasCurrentUser`, `authReadyState`, `credentialSource`,
`credentialPresent`, `persistenceType`, `packaged`, `protocol`,
`authDecision`, `authFailureReason`.

`KIOSK_AUTH_REQUIRED` Error에는 이 안전한 메타데이터만 붙이고 기존
`authentication-failed` 기록이 이를 수집한다. token, credential 원문, API key,
refresh/access/ID token, 이메일/비밀번호, UID는 새 로그에 기록하지 않는다.
성공/실패 조건은 바뀌지 않는다.

## 수정 후보

1. **권장: 장치 등록 기반 단기 custom-token 발급**
   - 설치 후 관리자가 장치를 등록하고, 보호된 장치 credential로 backend에서 짧은
     수명의 Firebase custom token을 발급/재발급한다.
   - 장점: 현재 custom claims/Rules 설계를 유지하며 폐기·회전이 가능하다.
   - 위험: 발급 backend, Windows 보안 저장소, 등록 UX와 운영 절차가 필요하다.
   - 예상 파일: main/preload IPC, 신규 identity client/secure storage, 등록 UI,
     backend token endpoint 및 테스트. 별도 수정 PR과 운영 설정이 필수다.

2. **제한적: 배포 서비스가 시작 시 환경변수 주입**
   - 장점: 현재 코드와 가장 가깝고 빠른 운영 복구가 가능하다.
   - 위험: custom token은 단기·1회용이므로 재시작/만료/로그인 실패 복구가 취약하고
     shortcut/installer 환경변수의 비밀 관리가 어렵다.
   - 앱 빌드에 token을 포함해서는 안 되며 외부 비밀 배포가 필요하다.

어느 후보든 Auth 초기화 완료를 기다린 뒤 currentUser를 판단하는 별도 수정이
필요하다. 이 조사 PR에서는 인증 provider, Rules, presence 경로와 연결 조건을
변경하지 않는다.
