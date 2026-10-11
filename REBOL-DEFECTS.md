# Defects of REBOL 2.7.8

This file lists the defects of REBOL 2.7.8 that the work on WebRebol found. WebRebol does not copy them.
`node bin/conform.mjs` writes the two lists of tests. Do not change them by hand.
The tests are from the public REBOL core test suite (rebolsource/rebol-test, Apache-2.0). Each test must give true.
REBOL is REBOL/View 2.7.8.4.3 in Docker, without a network.

## Defects that the suite does not show

- `checksum/method data 'md5` and `checksum/key` of REBOL/Core 2.7.8.4.10 (64 bits) give wrong values for data of 8 bytes or more. WebRebol gives the standard values.
- `collect-words` gives only the first word of the block.
- The cases of `test/cases/defects/defects.txt` give true in WebRebol and not in REBOL. `npm test` proves this.

## Tests that stop REBOL (a crash, or no end)

| Test | WebRebol | Source |
|---|---|---|
| 70 | true | `[bitset? charset reduce [to-char "^(A0)"]]` |
| 396 | false | `[ ; this runs forever in Rebol 2.7.8 0.0 == to decimal! [0.0 1e20] ]` |
| 397 | true | `[ ; this runs forever in Rebol 2.7.8 0.0 == to decimal! [1e308 -1e20] ]` |
| 429 | true | `[error? make error! [throw no-loop]]` |
| 999 | ERROR script bad-make-arg | `[ ; this code should not crash the interpreter o: bound? use [a b] [a: 1 b: 2 'a] p: make object! [c: 3 d: 4] make p o true ]` |
| 1071 | true | `[ a: 1x2 found? any [ error? try [b: a/(a: [3 4] 1)] b = 1 b = 3 ] ]` |
| 1138 | true | `[ a: 1x2 a/x: (a: [x 4] 3) found? any [ a == 3x2 a == [x 3] a == 1x2 a == [x 4] ] ]` |
| 1709 | CRASH Maximum call stack size exceeded | `[ a-value: copy [] insert/only a-value a-value b-value: copy [] insert/only b-value b-value error? try [equal? a-value b-value] true ]` |
| 1710 | CRASH Maximum call stack size exceeded | `[ a-value: copy/deep [[[]]] insert/only a-value/1/1 a-value b-value: copy/deep [[[]]] insert/only b-value/1/1 b-value error? try [equal? a-value b-value] true ]` |
| 2302 | CRASH Maximum call stack size exceeded | `[ a-value: copy [] insert/only a-value a-value b-value: copy [] insert/only b-value b-value error? try [strict-equal? a-value b-value] true ]` |
| 4220 | true | `[error? try [multiply -1 -2147483648]]` |

## Tests that REBOL fails and WebRebol passes (131)

| Test | REBOL gives | Source |
|---|---|---|
| 313 | ERROR math overflow | `[same? 1.7976931348623157e308 load mold 1.7976931348623157e308]` |
| 333 | ERROR math overflow | `[same? -1.7976931348623157E308 load mold -1.7976931348623157e308]` |
| 344 | ERROR math overflow | `[same? 1.7976931348623157e308 load mold/all 1.7976931348623157e308]` |
| 362 | ERROR math overflow | `[same? -1.7976931348623157E308 load mold/all -1.7976931348623157e308]` |
| 391 | false | `[ ; to decimal! [1.0 0.5] yields 1.0 in Rebol 2.7.8 (square-root 10.0) == to decimal! [1.0 0.5] ]` |
| 653 | false | `["%%2520" = mold to file! "%20"]` |
| 709 | ERROR script no-op-arg | `[ ; return from the unary op argument f: func [] [- (return 1 2) 3] 1 == f ]` |
| 710 | ERROR script cannot-use | `[ ; return from the first argument of a binary op f: func [] [(1 return 2 3) + 4] 2 == f ]` |
| 712 | ERROR script cannot-use | `[ ; return in the middle of an op expression f: func [] [1 + (return 2 3) + 4] 2 == f ]` |
| 739 | false | `[ ; argument passing with changes f1: func [x] [type? get/any 'x] f2: func [x] [type? get/any 'x] b: reduce [:f1 first [(change b :f2 1)]] integer! = do b ]` |
| 740 | false | `[ ; argument passing with changes f1: func [x] [type? get/any 'x] f2: func [x] [type? get/any 'x] b: reduce [:f1] integer! = b/1 (change b :f2 1) ]` |
| 741 | false | `[ ; we should not modify the function's frame ; until after the new args are collected classify: func [word [word!]] [ error? try [return type? get/any word] 0 ] f: func [x tick] [ if tick = 0 [ return [x tick] ] tick ] frame: f 0 0 f ( c: classify first frame ; generate a value with a different classification either not-equal? c none! [none] [1] ) ( c = classify first frame ) ]` |
| 743 | false | `[ ; check callback nesting behaviour (R2 2.7.8 bug) "az" = sort/compare "za" cmp: func [a b /nested] [unless nested [cmp/nested 0 0] a - b] ]` |
| 744 | false | `[ ; argreturn test get!: func [w [any-word!]] [ error? try [return get/any w] #[unset!] ] equal?!: func [t1 [any-type!] t2 [any-type!]] [ unless equal? type? get/any 't1 type? get/any 't2 [return false] if unset? get/any 't1 [return true] if error? :t1 [ return equal? disarm :t1 disarm :t2 ] equal? :t1 :t2 ] f: func [x] ['x] g: func [] [f return 4] w: f 1 set/any 'r1 get! w f 2 set/any 'r2 get! w g f 6 set/any 'r3 get! w f 7 set/any 'r4 get! w equal? equal?! get/any 'r1 get/any 'r2 equal?! get/any 'r3 get/any 'r4 ]` |
| 792 | ERROR math overflow | `[ ; decimal! to 32-bit integer minimum -2147483648 == to integer! -2147483648.9 ]` |
| 793 | ERROR math overflow | `[ ; decimal! to 32-bit integer maximum 2147483647 == to integer! 2147483647.9 ]` |
| 892 | false | `[ x: $999999999999999 found? any [ error? try [x: x + $1] not error? try [mold x] ] ]` |
| 893 | false | `[ x: -$999999999999999 found? any [ error? try [x: x - $1] not error? try [mold x] ] ]` |
| 895 | false | `[ found? any [ error? try [x: $1234567890123456] not error? try [mold x] ] ]` |
| 981 | false | `[ ; self found? any [ error? try [o: make object! [self: 1]] object? o ] ]` |
| 982 | false | `[ 1 = loop 1 [ make object! [break/return 1] 2 ] ]` |
| 983 | false | `[ 1 = catch [ make object! [throw 1] 2 ] ]` |
| 985 | false | `[ f: func [] [ make object! [return 1] 2 ] 1 = f ]` |
| 1139 | false | `[ error? try [now/precise:] ]` |
| 1332 | false | `[error? try [to time! "a"]]` |
| 1334 | ERROR syntax invalid | `[ found? any [ error? try [t: -596522:0:0 - 1:00] t = load mold t ] ]` |
| 1335 | ERROR syntax invalid | `[ found? any [ error? try [t: 596522:0:0 + 1:00] t = load mold t ] ]` |
| 1336 | false | `[error? try [load "--596523:-14:-07.772224"]]` |
| 1337 | ERROR syntax invalid | `[time? load "-596523:14:07.999999999"]` |
| 1340 | ERROR syntax invalid | `[time? 596523:14:07.999999999]` |
| 1402 | false | `["http://a%2520b" = mold http://a%2520b]` |
| 1407 | false | `[not equal? http://a.b.c/d?e=f%26 http://a.b.c/d?e=f&]` |
| 1459 | ERROR script expect-arg | `[ a-value: get '+ 1 a-value 2 == 3 ]` |
| 1680 | false | `[not-equal? reduce [:add] reduce [:action?]]` |
| 1686 | false | `[equal? reduce [:all] reduce [:all]]` |
| 1695 | false | `[not-equal? reduce [:-] reduce [:+]]` |
| 1829 | false | `[equal? equal? #"a" 97.0 equal? 97.0 #"a"]` |
| 2223 | false | `[equal? same? #"a" 97 same? 97 #"a"]` |
| 2300 | ERROR script past-end | `[ a-value: tail [1] clear head a-value strict-equal? a-value a-value ]` |
| 2529 | false | `[not head? bind next [1] 'rebol]` |
| 2533 | false | `[ o: make object! [a: none] same? o bound? in o 'a ]` |
| 2548 | OTHER none | `[a: 1 all [error? try [set [a] reduce [()]] a = 1]]` |
| 2550 | false | `[a: 1 attempt [set [a b] reduce [2 ()]] a = 1]` |
| 2560 | ERROR script no-value | `[unset 'a b: none set/any [:b] [a] unset? get/any 'b]` |
| 2574 | false | `[ a: 1 error? try [use 'a [a: 2]] a = 1 ]` |
| 2897 | ERROR user message | `[error? apply :make [error! ""]]` |
| 2899 | ERROR user message | `[ error? apply/only func [x [any-type!]] [ return get/any 'x ] head insert copy [] make error! "" ]` |
| 2900 | ERROR user message | `[ error? apply/only func ['x [any-type!]] [ return get/any 'x ] head insert copy [] make error! "" ]` |
| 2901 | ERROR user message | `[ error? apply/only func [:x [any-type!]] [ return get/any 'x ] head insert copy [] make error! "" ]` |
| 2932 | OTHER block | `[a: 1 loop 1 [a: error? break] :a =? 1] ; error? function takes 1 arg [a: 1 loop 1 [a: error? break/return 2] :a =? 1] [a: 1 loop 1 [a: type? break] :a =? 1] ; type? function takes 1-2 args [foo: func [x y] [9] a: 1 loop 1 [a: foo break 5] :a =? 1] ; foo takes 2 args [foo: func [x y] [9] a: 1 loop 1 [a: foo 5 break] :a =? 1] [foo: func [x y] [9] a: 1 loop 1 [a: foo break break] :a =? 1] ; check that BREAK is evaluated (and not CONTINUE): [foo: func [x y] [] a: 1 loop 2 [a: a + 1 foo break continue a: a + 10] :a =? 2] #r3 ; check that BREAK is not evaluated (but CONTINUE is): [foo: func [x y] [] a: 1 loop 2 [a: a + 1 foo continue break a: a + 10] :a =? 3] ; bug#1535 [loop 1 [words-of break] true] [loop 1 [values-of break] true] ; bug#1945 [loop 1 [spec-of break] true] ; the "result" of break should not be caught by try [a: 1 loop 1 [a: error? try [break]] :a =? 1] ;------------------------------------------------------------------------------- ; functions/control/case.r [ success: false case [true [success: true]] success ]` |
| 3095 | false | `[ val1: disarm try [do [1 / 0]] val2: disarm try [do/next [1 / 0]] val1/near = val2/near ]` |
| 3131 | false | `[ ; break cycle value unset? for i 1 10 1 [break] ]` |
| 3133 | false | `[ ; break/return cycle value -1 == for i 1 10 1 [break/return -1 i] ]` |
| 3138 | false | `[ ; block! cycle end for positive BUMP num: 0 1 == for i b: [1 2 3] tail b 4 [ num: num + 1 if num > 2 [break/return -1] index? i ] ]` |
| 3139 | false | `[ ; block! cycle end for negative BUMP num: 0 3 == for i back tail b: [1 2 3] b -3 [ num: num + 1 if num > 2 [break/return -1] index? i ] ]` |
| 3141 | false | `[ ; block! zero repetition success: true for i b: [1] tail :b -1 [success: false] success ]` |
| 3154 | false | `[ num: 0 for i b: [1] tail b 1 [ num: num + 1 if num > 2 [break] ] num <= 2 ]` |
| 3155 | ERROR math overflow | `[ num: 0 for i 2147483647 2147483647 1 [ num: num + 1 either num > 1 [break/return false] [true] ] ]` |
| 3156 | ERROR math overflow | `[ num: 0 for i -2147483648 -2147483648 -1 [ num: num + 1 either num > 1 [break/return false] [true] ] ]` |
| 3163 | ERROR math overflow | `[ num: 0 for i 2147483647 2147483647 2147483647 [ num: num + 1 if num <> 1 [break/return false] true ] ]` |
| 3172 | false | `[[] = for i b: tail [1] head b -2 [i]]` |
| 3301 | false | `[ integer? do does [map-each v [] [] 1] ]` |
| 3450 | OTHER block | `[cycle?: true unset? while [if cycle? [break] cycle?] [cycle?: false]] ; bug#1519 [cycle?: true 1 = while [cycle?] [break/return 1 cycle?: false]] [cycle?: true 1 = while [if cycle? [break/return 1] cycle?] [cycle?: false]] ; bug#1519 #r3only [ success: true cycle?: true while [cycle?] [cycle?: false continue success: false] success ]` |
| 3454 | false | `[ ; bug#1519 cycle?: true f1: does [while [if cycle? [return 1] cycle?] [cycle?: false 2]] 1 = f1 ]` |
| 3456 | false | `[ ; bug#1519 cycle?: true f1: does [while [if cycle? [exit] cycle?] [cycle?: false 2]] unset? f1 ]` |
| 3458 | false | `[ ; bug#1519 cycle?: true 1 = catch [while [if cycle? [throw 1] false] [cycle?: false]] ]` |
| 3460 | false | `[ ; bug#1519 cycle?: true 1 = catch/name [while [if cycle? [throw/name 1 'a] false] [cycle?: false]] 'a ]` |
| 3474 | false | `[error? try [load "':a"]]` |
| 3475 | false | `[error? try [load "':a:"]]` |
| 3476 | ERROR syntax invalid | `[ a: append copy [] load "<" a = load mold a ]` |
| 3477 | ERROR syntax invalid | `[ a: append copy first [()] load "<" a = load mold a ]` |
| 3478 | false | `[error? try [load "1xyz#"]]` |
| 3482 | false | `[ x: 1 error? try [x: load/header ""] not error? x ]` |
| 3568 | false | `[strict-equal? 1.1.1 255.255.255 and 2147483649.0]` |
| 3650 | false | `[odd? 999999999999999.0]` |
| 3651 | false | `[odd? -999999999999999.0]` |
| 3661 | false | `[odd? $999999999999999]` |
| 3662 | false | `[odd? -$999999999999999]` |
| 3693 | false | `[strict-equal? 1.1.1 0.0.0 or -2147483647]` |
| 3694 | false | `[strict-equal? 1.1.1 0.0.0 or -2147483647.0]` |
| 3697 | false | `[strict-equal? 1.1.1 0.0.0 or 2147483649.0]` |
| 3723 | false | `[strict-equal? 1.1.1 0.0.0 xor -2147483647]` |
| 3724 | false | `[strict-equal? 1.1.1 0.0.0 xor -2147483647.0]` |
| 3727 | false | `[strict-equal? 1.1.1 0.0.0 xor 2147483649.0]` |
| 3736 | false | `[error? try [abs -2147483648]]` |
| 3773 | false | `[error? try [add -2147483648 -2147483648]]` |
| 3922 | false | `[255.255.255 = add 1.0.0 2147483647]` |
| 3923 | false | `[255.255.255 = add 1.0.0 2147483647.0]` |
| 3924 | false | `[255.255.255 = add 1.0.0 2147483648.0]` |
| 3929 | OTHER none | `[ ; from OEIS sqrt3_over_2: 0.866025403784438646763723 dif: subtract 30.0 arccosine sqrt3_over_2 all [ dif >= negate 2 ** -48 dif <= 0 ] ]` |
| 4011 | false | `[0.0 == cosine 17 * 90]` |
| 4074 | false | `[10x10 == divide 1x1 .1]` |
| 4077 | false | `[255.255.255 == divide 1.1.1 1e-12]` |
| 4092 | false | `[not even? 999999999999999.0]` |
| 4093 | false | `[not even? -999999999999999.0]` |
| 4105 | false | `[not even? $999999999999999]` |
| 4106 | false | `[not even? -$999999999999999]` |
| 4116 | false | `[ ; from OEIS exp_2: 7.389056098930650227 0.0 == subtract exp_2 exp 2 ]` |
| 4275 | false | `[0x0 = multiply 1x1 1e300]` |
| 4277 | false | `[255.255.255 == multiply 1.1.1 2147483648.0]` |
| 4308 | false | `[255.255.255 = multiply 1.1.1 2147483648.0]` |
| 4348 | false | `[not positive? #"^@"]` |
| 4372 | false | `[ s: "aa" random/seed s a: random 10000 random/seed s a = random 10000 ]` |
| 4375 | false | `[-1:00 == remainder -1:00 -3:00]` |
| 4376 | false | `[1:00 == remainder 1:00 -3:00]` |
| 5180 | false | `[ n: 25000 s4: 0.0 repeat l n [ k: to decimal! l ks: sine/radians k s4: 1.0 / (k * k * k * ks * ks) + s4 ] 30.314520404 = round/to s4 1e-9 ]` |
| 5367 | false | `[255.255.255 = subtract 1.0.0 -2147483648]` |
| 5368 | false | `[255.255.255 = subtract 1.0.0 -2147483649.0]` |
| 5385 | false | `[ n: 25000 s4t: 0.0 repeat l n [ k: to decimal! l kt: tangent/radians k s4t: 1.0 / (kt * kt) + 1.0 / (k * k * k) + s4t ] 30.314520404 = round/to s4t 1e-9 ]` |
| 5466 | false | `[strict-equal? quote 'a/b/c append quote 'a/b 'c]` |
| 5475 | false | `[ blk: tail [1 2] same? blk at blk 2147483647 ]` |
| 5486 | false | `[ str: tail "12" same? str at str 2147483647 ]` |
| 5495 | false | `[ blk1: at copy [1 2 3 4 5] 3 blk2: at copy [1 2 3 4 5] 3 change/part blk1 6 -2147483647 change/part blk2 6 -2147483648 equal? head blk1 head blk2 ]` |
| 5513 | false | `[ "collect-words <no refinements>" [a b c d f] = collect-words cw-test-blk ]` |
| 5514 | false | `[ "collect-words/set" [b: d:] = collect-words/set cw-test-blk ]` |
| 5516 | false | `[ "collect-words/deep" [a b c d f e g h i] = collect-words/deep cw-test-blk ]` |
| 5517 | false | `[ "collect-words/set/deep" [b: d: e: g: f: i:] = collect-words/set/deep cw-test-blk ]` |
| 5519 | false | `[ "collect-words/set/deep/ignore" [b: d: e: g:] = collect-words/set/deep/ignore cw-test-blk [a: c: f: i:] ]` |
| 5544 | false | `[[1] = copy/part tail [1] -2147483648]` |
| 5545 | ERROR script no-memory | `["1" = copy/part tail "1" -2147483648]` |
| 5583 | false | `[ a: tail copy [1] remove head a 2 == index? a ]` |
| 5591 | ERROR script invalid-arg | `[ a: make path! 0 insert a 0 a == to path! [0] ]` |
| 5592 | ERROR script invalid-arg | `[ a: to path! [0] b: make path! 0 insert b first a a == b ]` |
| 5593 | ERROR script invalid-arg | `[ a: to path! [0] b: make path! 0 insert :b a a == b ]` |
| 5629 | ERROR script past-end | `[ a: make block! 0 b: at [1 2 3 4 5 6 7 8 9] 5 insert/part a b -2147483648 a == [1 2 3 4] ]` |
| 5716 | false | `[parse "12" ["" to end]]` |
| 5772 | false | `[ blk: next [1 2 3] same? tail blk skip blk 2147483647 ]` |
| 5773 | false | `[ blk: at [1 2 3] 3 same? tail blk skip blk 2147483646 ]` |
| 5774 | false | `[ blk: at [1 2 3] 4 same? tail blk skip blk 2147483645 ]` |
| 5823 | false | `[ lit-path: quote 'a/b strict-equal? swap :lit-path next :lit-path quote 'b/a ]` |
| 5855 | false | `["a^@b" = dehex "a%00b"]` |
