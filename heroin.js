var fs = require('fs'),
    Preprocessor, Compiler, Heroin;

(function () {
    var Reader, Tokens, States, Scanner, Parser;

    Reader = function (string) {
        var data = string,
            currentPosition = 0,
            dataLength = data.length;

        return {
            nextCharacter: function () {
                if (currentPosition >= dataLength) {
                    return '-1';
                };

                currentPosition += 1;

                return data[currentPosition - 1];
            },

            retract: function (n) {
                if (n === undefined) {
                    n = 1;
                };

                currentPosition -= n;

                if (n === 1 && currentPosition >= dataLength) {
                    return;
                };

                if (currentPosition < 0) {
                    currentPosition = 0;
                };
            }
        };
    };

    Tokens = {};
    Tokens.ENDOFSTREAM = 0;
    Tokens.SEMICOLON_TOKEN = Tokens.ENDOFSTREAM + 1;
    Tokens.ARROW_TOKEN = Tokens.SEMICOLON_TOKEN + 1;
    Tokens.LEFTPAREN_TOKEN = Tokens.ARROW_TOKEN + 1;
    Tokens.RIGHTPAREN_TOKEN = Tokens.LEFTPAREN_TOKEN + 1;
    Tokens.LEFTBRACKET_TOKEN = Tokens.RIGHTPAREN_TOKEN + 1;
    Tokens.RIGHTBRACKET_TOKEN = Tokens.LEFTBRACKET_TOKEN + 1;
    Tokens.LEFTBRACE_TOKEN = Tokens.RIGHTBRACKET_TOKEN + 1;
    Tokens.RIGHTBRACE_TOKEN = Tokens.LEFTBRACE_TOKEN + 1;
    Tokens.BOOLEAN_TOKEN = Tokens.RIGHTBRACE_TOKEN + 1;
    Tokens.NUMBER_TOKEN = Tokens.BOOLEAN_TOKEN + 1;
    Tokens.STRING_TOKEN = Tokens.NUMBER_TOKEN + 1;
    Tokens.IDENTIFIER_TOKEN = Tokens.STRING_TOKEN + 1;
    Tokens.COMMENT_TOKEN = Tokens.IDENTIFIER_TOKEN + 1;
    Tokens.index = {
        '-1': 'ENDOFSTREAM',
        ';': 'SEMICOLON_TOKEN',
        '(': 'LEFTPAREN_TOKEN',
        ')': 'RIGHTPAREN_TOKEN',
        '[': 'LEFTBRACKET_TOKEN',
        ']': 'RIGHTBRACKET_TOKEN',
        '{': 'LEFTBRACE_TOKEN',
        '}': 'RIGHTBRACE_TOKEN',
    };

    States = {};
    States.START_STATE = 0;
    States.STRING_STATE = States.START_STATE + 1;
    States.COMMENT_STATE = States.STRING_STATE + 1;
    States.NUMBER_STATE = States.COMMENT_STATE + 1;
    States.IDENTIFIER_STATE = States.NUMBER_STATE + 1;

    Scanner = function (reader) {
        var reader = reader,
            currentLine = 1,
            state = States.START_STATE,
            numDots = 0, makeToken;

        makeToken = function (type, text) {
            return {
                type: type,
                text: text
            };
        };

        return {
            nextToken: function () {
                var bufferString = '';

                while (true) {
                    switch (state) {
                        case States.START_STATE:
                            var character = reader.nextCharacter();

                            switch (character) {
                                case '-1': case ';': case '(': case ')': case '[': case ']': case '{': case '}':
                                    return makeToken(Tokens[Tokens.index[character]]);
                                case '\r': case '\n':
                                    currentLine += 1;
                                    break;
                                case '"':
                                    state = States.STRING_STATE;
                                    bufferString = character;
                                    break;
                                case '#':
                                    state = States.COMMENT_STATE;
                                    bufferString = character;
                                    break;
                                case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
                                    state = States.NUMBER_STATE;
                                    bufferString = character;
                                    break;
                                case '-':
                                    bufferString = character;

                                    if (/\d/.test(reader.nextCharacter())) {
                                        state = States.NUMBER_STATE;
                                    } else {
                                        state = States.IDENTIFIER_STATE;
                                    };

                                    reader.retract();
                                    break;
                                default:
                                    if (!/\s/.test(character)) {
                                        state = States.IDENTIFIER_STATE;
                                        bufferString = character;
                                    };
                            };

                            break;
                        case States.STRING_STATE:
                            var character = reader.nextCharacter();

                            while (character !== '"') {
                                bufferString += character;
                                character = reader.nextCharacter();
                            };

                            bufferString += character;
                            state = States.START_STATE;

                            return makeToken(Tokens.STRING_TOKEN, bufferString);
                        case States.COMMENT_STATE:
                            var character = reader.nextCharacter();

                            while (character !== '\r' && character !== '\n' && character !== '-1') {
                                bufferString += character;
                                character = reader.nextCharacter();
                            };

                            state = States.START_STATE;

                            return makeToken(Tokens.COMMENT_TOKEN, bufferString);
                        case States.NUMBER_STATE:
                            var character = reader.nextCharacter();

                            while (/[\d\.]/.test(character)) {
                                if (character === '.') {
                                    if (numDots > 1) {
                                        break;
                                    } else {
                                        numDots += 1;
                                    };
                                };

                                bufferString += character;
                                character = reader.nextCharacter();
                            };

                            reader.retract();
                            state = States.START_STATE;

                            return makeToken(Tokens.NUMBER_TOKEN, bufferString);
                        case States.IDENTIFIER_STATE:
                            var character = reader.nextCharacter();

                            while (/[^\;\(\)\[\]\{\}\"\#\r\n\s]/.test(character)) {
                                bufferString += character;
                                character = reader.nextCharacter();
                            };

                            reader.retract();
                            state = States.START_STATE;

                            if (bufferString === 'true' || bufferString === 'false') {
                                return makeToken(Tokens.BOOLEAN_TOKEN, bufferString);
                            } else if (bufferString === '->') {
                                return makeToken(Tokens.ARROW_TOKEN, bufferString);
                            } else if (!/\.\.|\.$/.test(bufferString)) {
                                return makeToken(Tokens.IDENTIFIER_TOKEN, bufferString);
                            };

                            break;
                        default:
                    };
                };
            }
        };
    };

    Parser = function (scanner) {
        var scanner = scanner,
            currentToken = {},
            aheadToken = {},
            nextToken, lookAhead, parseSourceCode;

        aheadToken.consumed = true;

        nextToken = function () {
            if (aheadToken.consumed) {
                var token = scanner.nextToken();

                while (token === Tokens.COMMENT_TOKEN) {
                    token = scanner.nextToken();
                };

                currentToken.type = token.type;
                currentToken.text = token.text;
            } else {
                currentToken.type = aheadToken.type;
                currentToken.text = aheadToken.text;
                aheadToken.consumed = true;
            };

            return currentToken.type;
        };

        lookAhead = function () {
            if (aheadToken.consumed) {
                var token = scanner.nextToken();

                while (token === Tokens.COMMENT_TOKEN) {
                    token = scanner.nextToken();
                };

                aheadToken.type = token.type;
                aheadToken.text = token.text;
                aheadToken.consumed = false;
            };

            return aheadToken.type;
        };

        parseSourceCode = function () {
            while (true) {
                switch (lookAhead()) {
                    case Tokens.IDENTIFIER_TOKEN:
                        nextToken();

                        switch (lookAhead()) {
                            case Tokens.LEFTBRACKET_TOKEN:
                                var id = currentToken.text;

                                nextToken();

                                if (arguments[0] !== undefined) {
                                    arguments[0].push(parseSourceCode([id]));
                                } else {
                                    return parseSourceCode([id]);
                                };

                                continue;
                            case Tokens.SEMICOLON_TOKEN: case Tokens.RIGHTBRACKET_TOKEN: case Tokens.RIGHTPAREN_TOKEN: case Tokens.RIGHTBRACE_TOKEN: case Tokens.IDENTIFIER_TOKEN:
                                if (arguments[0] !== undefined) {
                                    arguments[0].push(currentToken.text);
                                } else {
                                    return currentToken.text;
                                };

                                continue;
                            default:
                        };

                        continue;
                    case Tokens.LEFTBRACKET_TOKEN:
                        nextToken();

                        if (arguments[0] !== undefined) {
                            arguments[0].push(parseSourceCode([]));
                        } else {
                            return parseSourceCode([]);
                        };

                        continue;
                    case Tokens.SEMICOLON_TOKEN:
                        nextToken();

                        if (lookAhead() === Tokens.RIGHTBRACKET_TOKEN) {
                            arguments[0].push([]);
                        };

                        continue;
                    case Tokens.LEFTPAREN_TOKEN:
                        nextToken();

                        if (arguments[0] !== undefined) {
                            arguments[0].push(parseSourceCode(['quote']));
                        } else {
                            return parseSourceCode(['quote']);
                        };

                        continue;
                    case Tokens.LEFTBRACE_TOKEN:
                        nextToken();

                        if (arguments[0] !== undefined) {
                            arguments[0].push(parseSourceCode(['unquote']));
                        } else {
                            return parseSourceCode(['unquote']);
                        };

                        continue;
                    case Tokens.ARROW_TOKEN:
                        nextToken();

                        if (arguments[0][0] !== '?') {
                            arguments[0].unshift('?');
                        };

                        arguments[0][arguments[0].length - 1] = [arguments[0][arguments[0].length - 1]];

                        if (lookAhead() === Tokens.LEFTBRACKET_TOKEN) {
                            arguments[0][arguments[0].length - 1].push(parseSourceCode([]));
                        } else {
                            arguments[0][arguments[0].length - 1].push(parseSourceCode());
                        };

                        continue;
                    case Tokens.NUMBER_TOKEN: case Tokens.STRING_TOKEN: case Tokens.BOOLEAN_TOKEN:
                        nextToken();

                        if (arguments[0] !== undefined) {
                            arguments[0].push(currentToken.text);
                        } else {
                            return currentToken.text;
                        };

                        continue;
                    case Tokens.RIGHTPAREN_TOKEN: case Tokens.RIGHTBRACKET_TOKEN: case Tokens.RIGHTBRACE_TOKEN:
                        nextToken();
                        return arguments[0];
                    default:
                };
            };
        };

        return function () {
            var parseTree = [];

            while (true) {
                parseTree.push(parseSourceCode());

                while (lookAhead() === Tokens.COMMENT_TOKEN) {
                    nextToken();
                };

                if (lookAhead() === Tokens.ENDOFSTREAM) {
                    break;
                };
            };

            return parseTree;
        }();
    };

    Preprocessor = function (string) {
        var reader = Reader(string),
            scanner = Scanner(reader);

        return Parser(scanner);
    };
}());

(function () {
    var core = ['quote', '?', 'var', '=', 'fct', 'begin', 'unquote',
            'atom', '==', 'car', 'cdr', 'cons',
            '+', '-', '*', '/', '%', '<', '>', 'dlt', 'tpof', 'rtn'],
        globalEnv = {}, macroTable = {}, closureIndex = 0,
        Primitive, FunctionCall, Macro, SymbolExchanger, VariableSearcher, CoreFunction;

    VariableSearcher = function (symbol, env) {
        for (var i = closureIndex; i >= 0; i -= 1) {
            var buffer = globalEnv;

            for (var j = 0; j < i; j += 1) {
                buffer = buffer['child'];
            };

            if (symbol in buffer) {
                return buffer;
            };
        };

        return false;
    };

    SymbolExchanger = function (array, symbol, target) {
        for (var i = 0, iMax = array.length; i < iMax; i += 1) {
            if (Array.isArray(array[i])) {
                array[i] = SymbolExchanger(array[i], symbol, target);
            };

            if (array[i] === symbol) {
                array[i] = target;
            };
        };

        return array;
    };

    Primitive = function (symbol, env) {
        if (/^-?([0-9])(\d+)?(\.\d+)?$/.test(symbol)) {
            return parseFloat(symbol);
        } else if (/^\"/.test(symbol)) {
            return symbol.slice(1, -1);
        } else if (symbol === 'true') {
            return true;
        } else if (symbol === 'false') {
            return false;
        } else {
            var location = VariableSearcher(symbol, env);

            if (location !== false) {
                return location[symbol];
            };
        };
    };

    FunctionCall = {
        'atom': function (Arguments, env) {
            if (Array.isArray(Arguments[0]) === false || Arguments === []) {
                return true;
            } else {
                return false;
            };
        },

        '==': function (Arguments, env) {
            if (Array.isArray(Arguments[0]) || Array.isArray(Arguments[1])) {
                return false;
            };

            if (Arguments[0] === Arguments[1]) {
                if (Arguments[2] !== undefined) {
                    return this['=='](Arguments.slice(1), env);
                } else {
                    return true;
                };
            } else {
                return false;
            };
        },

        'car': function (Arguments, env) {
            if (Arguments.length === 1) {
                return false;
            } else {
                return Arguments.slice(0, 1)[0];
            };
        },

        'cdr': function (Arguments, env) {
            if (Arguments.length === 1) {
                return false;
            } else if (Arguments.length === 2) {
                return Arguments.slice(1)[0];
            } else {
                return Arguments.slice(1);
            };
        },

        'cons': function (Arguments, env) {
            for (i = 0, max = Arguments[1].length; i < max; i += 1) {
                Arguments[0].push(Arguments[1][i]);
            };

            return Arguments[0];
        }
    };

    Macro = function (macroName, Arguments) {
        macroTable[macroName] = function () {
            for (var i = 0, max = Arguments[0].length; i < max; i += 1) {
                SymbolExchanger(Arguments[1], Arguments[0][i], arguments[i]);
            };

            return Arguments[1];
        };
    };

    CoreFunction = {
        '+': function (Arguments, env) {
            if (Arguments.length === 0) {
                return 0;
            } else if (Arguments.length === 1) {
                return Arguments[0];
            } else {
                return Arguments.shift() + this['+'](Arguments);
            };
        },

        '-': function (Arguments, env) {
            if (Arguments.length === 0) {
                return 0;
            } else if (Arguments.length === 1) {
                return -Arguments[0];
            } else {
                return Arguments.shift() - this['+'](Arguments);
            };
        },

        '*': function (Arguments, env) {
            if (Arguments.length === 0) {
                return 1;
            } else if (Arguments.length === 1) {
                return Arguments[0];
            } else {
                return Arguments.shift() * this['*'](Arguments);
            };
        },

        '/': function (Arguments, env) {
            if (Arguments.length === 0) {
                return 1;
            } else if (Arguments.length === 1) {
                return 1 / Arguments[0];
            } else {
                return Arguments.shift() / this['*'](Arguments);
            };
        },

        '%': function (Arguments, env) {
            return Arguments[0] % Arguments[1];
        },

        '<': function (Arguments, env) {
            if (Arguments.length > 2) {
                if (Arguments[0] < Arguments[1]) {
                    Arguments.shift();
                    return this['<'](Arguments);
                } else {
                    return false;
                };
            } else {
                return Arguments[0] < Arguments[1];
            };
        },

        '>': function (Arguments, env) {
            if (Arguments.length > 2) {
                if (Arguments[0] > Arguments[1]) {
                    Arguments.shift();
                    return this['>'](Arguments);
                } else {
                    return false;
                };
            } else {
                return Arguments[0] > Arguments[1];
            };
        },

        'dlt': function (Arguments, env) {
            delete env[Arguments[0]];
        },

        'tpof': function (Arguments, env) {
            if (Array.isArray(Arguments[0])) {
                return 'array';
            } else {
                return typeof Arguments[0];
            };
        },

        'rtn': function (Arguments, env) {
            if (Arguments !== []) {
                return Arguments.unshift('rtn');
            } else {
                return 'rtn';
            };
        }
    };

    Compiler = function (parseTree) {
        var Evaluate, Apply, Special;

        Evaluate = function (Expression, env) {
            if (!Array.isArray(Expression)) {
                return Primitive(Expression, env);
            } else {
                if (core.indexOf(Expression[0]) !== -1 || Expression[0] === 'macro' || Expression[0] in macroTable || Expression[0] in globalEnv) {
                    return Apply(Expression.shift(), Expression, env);
                } else if (/\./.test(Expression[0])) {
                    Expression[0] = Expression[0].split('.');

                    return Apply(Expression.shift(), Expression, env);
                };
            };
        };

        Apply = function (Procedure, Arguments, env) {
            if (Procedure === 'macro') {
                return Macro(Arguments.shift(), Arguments);
            } else if (Procedure in macroTable) {
                return Evaluate(macroTable[Procedure].apply(this, Arguments), env);
            } else if (Procedure in Special) {
                return Special[Procedure](Arguments, env);
            } else {
                for (var i = 0, max = Arguments.length; i < max; i += 1) {
                    if (Arguments[i][0] === 'quote') {
                        Arguments = Evaluate(Arguments[i], env);
                    } else {
                        Arguments[i] = Evaluate(Arguments[i], env);
                    };
                };

                if (Array.isArray(Procedure)) {
                    if (Procedure[0] in global) {
                        var call = global;
                    };

                    for (var i = 0, max = Procedure.length; i < max; i += 1) {
                        call = call[Procedure[i]];
                    };

                    call.apply(this, Arguments);
                } else {
                    if (Procedure in FunctionCall) {
                        return FunctionCall[Procedure](Arguments, env);
                    } else if (Procedure in CoreFunction) {
                        return CoreFunction[Procedure](Arguments, env);
                    } else if (Procedure in globalEnv) {
                        return globalEnv[Procedure](Arguments, env);
                    };
                };
            };
        };

        Special = {
            'quote': function (Arguments, env) {
                if (Arguments.length === 1) {
                    return Arguments[0];
                } else {
                    return Arguments;
                };
            },

            '?': function (Arguments, env) {
                if (Arguments[1] === undefined) {
                    if (Arguments[0] === []) {
                        return false;
                    } else {
                        return Evaluate(Arguments[0]);
                    };
                } else if (Evaluate(Arguments[0][0], env)) {
                    return Evaluate(Arguments[0][1], env);
                } else if (Arguments[1] === undefined) {
                    return false;
                } else {
                    return this['?'](Arguments.slice(1), env);
                };
            },

            'var': function (Arguments, env) {
                var key = Array.isArray(Arguments[0]) ? Evaluate(Arguments[0], env) : Arguments[0];

                if (closureIndex === 0) {
                    globalEnv[key] = Evaluate(Arguments[1], env);
                } else {
                    env[key] = Evaluate(Arguments[1], env);
                };

                return key;
            },

            '=': function (Arguments, env) {
                var key = Array.isArray(Arguments[0]) ? Evaluate(Arguments[0], env) : Arguments[0],
                    tagetEnv = VariableSearcher(key, env);

                if (tagetEnv !== false) {
                    tagetEnv[key] = Evaluate(Arguments[1], env);
                };

                return key;
            },

            'fct': function (Arguments, env) {
                var lambda = function () {
                    arguments[1]['child'] = {};
                    closureIndex += 1;
                    console.log(arguments[0]);
                    for (var i = 0, max = Arguments[0].length; i < max; i += 1) {
                        SymbolExchanger(Arguments[1], Arguments[0][i], arguments[0][i]);
                    };

                    var result = Evaluate(Arguments[1], arguments[1]['child']);

                    delete arguments[1]['child'];
                    closureIndex -= 1;

                    return result;
                };

                if (Arguments[2]) {
                    return lambda.apply(this, Arguments[2]);
                } else {
                    return lambda;
                };
            },

            'begin': function (Arguments, env) {
                for (var i = 0, max = Arguments.length; i < max; i += 1) {
                    if (i === max - 1) {
                        return Evaluate(Arguments[i], env);
                    } else {
                        var result = Evaluate(Arguments[i], env);

                        if (result[0] === 'rtn') {
                            return result[1];
                        };
                    };
                };
            },

            'unquote': function (Arguments, env) {
                return Evaluate(Evaluate(Arguments[0], env), env);
            }
        };

        return function () {
            var std = Preprocessor(fs.readFileSync('./std.hrn', 'utf8').slice(1));
            
            for (var i = 0, imax = std.length; i < imax; i += 1) {
                Evaluate(std[i], globalEnv);
                delete globalEnv['child'];
            };

            for (var j = 0, jmax = parseTree.length; j < jmax; j += 1) {
                Evaluate(parseTree[j], globalEnv);
                delete globalEnv['child'];
            };
            console.log(globalEnv);
        }();
    };
}());

Heroin = function (path) {
    var data = fs.readFileSync(path, 'utf8').slice(1);

    Compiler(Preprocessor(data));
};

Heroin('./test.hrn');

module.exports = Heroin;