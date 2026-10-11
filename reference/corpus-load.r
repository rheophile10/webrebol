REBOL [Title: "Loads each script of the folder /corpus and writes each loaded value with its type"]
walk: func [block /local value] [
    ; A foreach loop is not correct here, because REBOL 2 binds the body again in each inner call.
    while [not tail? block] [
        set/any 'value first block
        if unset? get/any 'value [value: 'unset-value]
        either any-block? :value [
            print [type? :value "["]
            walk :value
            print "]"
        ] [
            print [type? :value either any-word? :value [lowercase form :value] [mold :value]]
        ]
        block: next block
    ]
]
foreach file sort read %/corpus/ [
    if %.r = suffix? file [
        print ["@@FILE" file]
        either error? set/any 'loaded try [load/all read join %/corpus/ file] [
            fault: disarm :loaded
            print ["LOAD-ERROR" fault/type fault/id]
        ] [
            walk loaded
        ]
    ]
]
print "@@END"
quit
