const PIZZAS = [
  {id:'super', name:'수퍼파파스', cat:'BEST', img:'assets/images/super_papas.jpg', prices:{R:19900,L:28500,F:33900}, sizes:['R','L','F']},
  {id:'irish', name:'아이리쉬 포테이토', cat:'BEST', img:'assets/images/irish_potato.jpg', prices:{R:18900,L:27500,F:32900}, sizes:['R','L','F']},
  {id:'allmeat', name:'올미트', cat:'BEST', img:'assets/images/all_meat.jpg', prices:{R:19900,L:29500,F:34900}, sizes:['R','L','F']},
  {id:'favorite', name:'존스 페이버릿', cat:'BEST', img:'assets/images/johns_favorite.jpg', prices:{L:29500,F:34900}, sizes:['L','F']},
  {id:'ranch', name:'스파이시 치킨랜치', cat:'BEST', img:'assets/images/spicy_chicken_ranch.jpg', prices:{R:19900,L:29500,F:34900}, sizes:['R','L','F']},
  {id:'bbq', name:'치킨 바베큐', cat:'BEST', img:'assets/images/chicken_bbq.jpg', prices:{R:18900,L:27500,F:32900}, sizes:['R','L','F']},
  {id:'italian', name:'스파이시 이탈리안', cat:'SPECIALTY', img:'assets/images/spicy_italian.jpg', prices:{L:27500,F:33900}, sizes:['L','F']},
  {id:'six', name:'식스 치즈', cat:'SPECIALTY', img:'assets/images/six_cheese.jpg', prices:{L:26500,F:31900}, sizes:['L','F']},
  {id:'bulgogi', name:'프리미엄 직화불고기', cat:'SPECIALTY', img:'assets/images/bulgogi.jpg', prices:{L:29500,F:34900}, sizes:['L','F']},
  {id:'ham', name:'햄 머쉬룸 식스치즈', cat:'SPECIALTY', img:'assets/images/ham_mushroom.jpg', prices:{L:28500,F:33900}, sizes:['L','F']},
  {id:'pepperoni', name:'페퍼로니', cat:'CLASSIC', img:'assets/images/pepperoni.jpg', prices:{R:17900,L:25500,F:30900}, sizes:['R','L','F']},
  {id:'hawaiian', name:'하와이안', cat:'CLASSIC', img:'assets/images/hawaiian.jpg', prices:{R:17900,L:26500,F:32900}, sizes:['R','L','F']},
  {id:'margherita', name:'마가리타', cat:'CLASSIC', img:'assets/images/margherita.jpg', prices:{R:16900,L:23500,F:28900}, sizes:['R','L','F']},
  {id:'garden', name:'가든 스페셜', cat:'CLASSIC', img:'assets/images/garden_special.jpg', prices:{R:17900,L:26500,F:31900}, sizes:['R','L','F']},
  {id:'shrimp', name:'쉬림프 알프레도', cat:'THIN', img:'assets/images/shrimp_alfredo.jpg', prices:{F:34900}, sizes:['F'], thinOnly:true},
];

const SIDES = [
  {id:'wings',name:'파파스윙',price:9900,img:'assets/images/wings.jpg'},
  {id:'strips',name:'치킨스트립',price:9900,img:'assets/images/chicken_strips.jpg'},
  {id:'cheesesticks',name:'치즈스틱',price:9900,img:'assets/images/cheese_sticks.jpg'},
  {id:'baconsticks',name:'베이컨치즈스틱',price:10900,img:'assets/images/bacon_cheese_sticks.jpg'},
  {id:'meatpasta',name:'미트소스파스타',price:8900,img:'assets/images/meat_sauce_pasta.png',set2:true},
  {id:'whitepasta',name:'화이트소스파스타',price:8900,img:'assets/images/white_pasta.png',set2:true},
  {id:'rosepasta',name:'로제파스타',price:8900,img:'assets/images/rose_pasta.png',set2:true},
  {id:'breadsticks',name:'브레드스틱',price:6900,img:'assets/images/bread_sticks.jpg'},
  {id:'corn',name:'파파 콘샐러드',price:2400,img:'assets/images/corn_salad.png'},
  {id:'coleslaw',name:'파파 코울슬로',price:2400,img:'assets/images/coleslaw.png'},
  {id:'brownie',name:'더블 초코칩 브라우니',price:12900,img:'assets/images/brownie.jpg',setExcluded:true},
];

const DRINKS=[
 {id:'coke-500',name:'코카콜라',shortName:'코카콜라',brand:'coke',zero:false,volume:'500mL',price:1800,img:'assets/images/coke_500.png'},
 {id:'coke-zero-500',name:'코카콜라 제로',shortName:'코카콜라 제로',brand:'coke',zero:true,volume:'500mL',price:1800,img:'assets/images/coke_zero_500.jpg'},
 {id:'sprite-500',name:'스프라이트',shortName:'스프라이트',brand:'sprite',zero:false,volume:'500mL',price:1800,img:'assets/images/sprite_500.png'},
 {id:'sprite-zero-500',name:'스프라이트 제로',shortName:'스프라이트 제로',brand:'sprite',zero:true,volume:'500mL',price:1800,img:'assets/images/sprite_zero_500.png'},
 {id:'coke-125',name:'코카콜라',shortName:'코카콜라',brand:'coke',zero:false,volume:'1.25L',price:2500,img:'assets/images/coke_1250.png'},
 {id:'coke-zero-15',name:'코카콜라 제로',shortName:'코카콜라 제로',brand:'coke',zero:true,volume:'1.25L',price:2500,img:'assets/images/coke_zero_1250.png'},
 {id:'sprite-15',name:'스프라이트',shortName:'스프라이트',brand:'sprite',zero:false,volume:'1.5L',price:2500,img:'assets/images/sprite_1500.jpg'},
 {id:'sprite-zero-15',name:'스프라이트 제로',shortName:'스프라이트 제로',brand:'sprite',zero:true,volume:'1.5L',price:2500,img:'assets/images/sprite_zero_15l.png'},
 {id:'water-500',name:'생수 500ml',shortName:'생수',brand:'water',volume:'500mL',price:1000},
 {id:'budweiser-bottle',name:'버드와이저 병맥주',shortName:'버드와이저',brand:'beer',volume:'1병',price:5000}
];

const TOPPINGS = [
  '엑스트라 치즈','3블렌드 치즈','2블렌드 치즈','베이컨','비프','치킨','이탈리안 소시지','햄','페퍼로니','토마토','포테이토','콘','파인애플','블랙 올리브','할라피뇨','양파','청피망','양송이'
].map((name,i)=>{
  let price;
  if(i===0) price={R:1000,L:1500,F:1500};
  else if(i===1||i===2) price={R:1000,L:1500,F:2000};
  else price={R:1000,L:1500,F:2000};
  return {id:'t'+i,name,price};
});
