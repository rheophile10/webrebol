REBOL [Title: "Writes the molded result of each line of a case file, as hexadecimal text"]
hex: func [text] [trim/all enbase/base to-binary text 16]
foreach line read/lines to-file system/script/args [
    if not empty? line [
        answer: either error? set/any 'result try [mold/only load/all line] [
            fault: disarm :result
            reform ["!" fault/type fault/id]
        ] [result]
        print [hex line hex answer]
    ]
]
quit
