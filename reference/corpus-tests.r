REBOL [Title: "Evaluates each test of /cases/tests.hex in one session and writes its outcome"]
foreach test-line read/lines %/cases/tests.hex [
    test-index: first parse test-line none
    test-source: to-string debase/base second parse test-line none 16
    test-outcome: either error? set/any 'test-result try [do load test-source] [
        test-fault: disarm :test-result
        rejoin ["ERROR " test-fault/type " " test-fault/id]
    ] [
        case [
            unset? get/any 'test-result ["unset"]
            logic? :test-result [mold test-result]
            true [join "OTHER " type? :test-result]
        ]
    ]
    print ["@@T" test-index test-outcome]
]
print "@@END"
quit
