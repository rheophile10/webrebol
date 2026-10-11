REBOL [Title: "Writes the output and the molded result of each line of a case file"]
hex: func [text] [trim/all enbase/base to-binary text 16]
foreach case-line read/lines to-file system/script/args [
    if not empty? case-line [
        print ["^/@@CASE" hex case-line]
        case-answer: either error? set/any 'case-result try [do case-line] [
            case-fault: disarm :case-result
            reform ["!" case-fault/type case-fault/id]
        ] [
            either unset? get/any 'case-result ["unset"] [mold :case-result]
        ]
        print ["^/@@RESULT" hex case-answer]
    ]
]
quit
