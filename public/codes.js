// 교환 코드. 1회용 코드를 만들려면 (이 브라우저 저장에서 1번이 기본):
//   node tools/make-code.js --coins 100
//   node tools/make-code.js --coins 100 --item snack:2 --owned hair_pony --uses 1
// 직접 고쳐도 돼요. perSave 를 빼면 1번, expires 는 그 시각(ms)부터 만료.
var REDEEM_CODES = {
  "WELCOME": {
    "coins": 50,
    "items": {
      "snack": 2
    },
    "perSave": 1
  },
  "복권선물": {
    "items": {
      "ticket": 1
    },
    "perSave": 1
  },
  "WQ93BU": {
    "coins": 100,
    "perSave": 1
  }
};
