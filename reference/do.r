REBOL [Title: "Writes the output and the molded result of one case. The argument is the case as hexadecimal text"]
hex: func [text] [trim/all enbase/base to-binary text 16]
case-line: to-string debase/base system/script/args 16
case-answer: either error? set/any 'case-result try [do case-line] [
    case-fault: disarm :case-result
    reform ["!" case-fault/type case-fault/id mold case-fault/arg1 mold case-fault/arg2 mold case-fault/arg3]
] [
    either unset? get/any 'case-result ["unset"] [mold :case-result]
]
print ["^/@@RESULT" hex case-answer]
quit
