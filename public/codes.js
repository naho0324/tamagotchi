// 교환 코드. 전 세계 1회 (그리고 이 저장에서도 1회)가 기본:
//   node tools/make-code.js --coins 100
//   node tools/make-code.js --coins 100 --item snack:2 --owned hair_pony --uses 1 --max 1
// maxUses = 서버 전체 횟수, perSave = 이 브라우저 저장 횟수. 빼면 둘 다 1.
var REDEEM_CODES = {
  "WELCOME": {
    "coins": 50,
    "items": {
      "snack": 2
    },
    "perSave": 1,
    "maxUses": 1
  },
  "복권선물": {
    "items": {
      "ticket": 1
    },
    "perSave": 1,
    "maxUses": 1
  },
  "WQ93BU": {
    "coins": 100,
    "perSave": 1,
    "maxUses": 1
  }
};
