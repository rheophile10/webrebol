REBOL [Title: "Loads each script of the folder /corpus and writes each loaded value with its type"]
walk: func [block] [
    foreach value block [
        either any-block? :value [
            print [type? :value "["]
            walk :value
            print "]"
        ] [
            print [type? :value either any-word? :value [lowercase form :value] [mold :value]]
        ]
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
