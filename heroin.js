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
            numDots = 0;

        return {
            nextToken: function () {
                var bufferString = '';

                while (true) {
                    switch (state) {
                        case States.START_STATE:
                            var character = reader.nextCharacter();

                            switch (character) {
                                case '-1': case ';': case '(': case ')': case '[': case ']': case '{': case '}':
                                    return { type: 'separator', text: character };
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

                            return { type: 'value', text: bufferString };
                        case States.COMMENT_STATE:
                            var character = reader.nextCharacter();

                            while (character !== '\r' && character !== '\n' && character !== '-1') {
                                bufferString += character;
                                character = reader.nextCharacter();
                            };

                            state = States.START_STATE;

                            return { type: 'comment', text: bufferString };
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

                            return { type: 'value', text: bufferString };
                        case States.IDENTIFIER_STATE:
                            var character = reader.nextCharacter();

                            while (/[^\;\(\)\[\]\{\}\"\#\r\n\s]/.test(character)) {
                                bufferString += character;
                                character = reader.nextCharacter();
                            };

                            reader.retract();
                            state = States.START_STATE;

                            if (bufferString === 'true' || bufferString === 'false') {
                                return { type: 'value', text: bufferString };
                            } else if (bufferString === '->') {
                                return { type: 'separator', text: bufferString };
                            } else if (!/\.\.|\.$/.test(bufferString)) {
                                return { type: 'identifier', text: bufferString };
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
            consumed = true,
            nextToken, lookAhead, parseSourceCode;

        nextToken = function () {
            if (consumed) {
                var token = scanner.nextToken();

                while (token.type === 'comment') {
                    token = scanner.nextToken();
                };

                currentToken = token;
            } else {
                currentToken= aheadToken;
                consumed = true;
            };

            return currentToken;
        };

        lookAhead = function () {
            if (consumed) {
                var token = scanner.nextToken();

                while (token.type === 'comment') {
                    token = scanner.nextToken();
                };

                aheadToken= token;
                consumed = false;
            };

            return aheadToken;
        };

        parseSourceCode = function () {
            while (true) {
                switch (lookAhead().type) {
                    case 'identifier':
                        nextToken();

                        switch (lookAhead().text) {
                            case '[':
                                var id = currentToken.text;

                                nextToken();

                                if (arguments[0] !== undefined) {
                                    arguments[0].push(parseSourceCode([id]));
                                } else {
                                    return parseSourceCode([id]);
                                };

                                continue;
                            case ';': case ']':
                                if (arguments[0] !== undefined) {
                                    arguments[0].push(currentToken.text);
                                } else {
                                    return currentToken.text;
                                };

                                continue;
                            default:
                        };

                        continue;
                    case 'separator':
                        switch (lookAhead().text) {
                            case '(':
                                var list = ['quote'];

                                nextToken();

                                while (true) {
                                    switch (lookAhead().type) {
                                        case 'value':
                                            nextToken();
                                            list.push(currentToken.text);
                                            continue;
                                        case 'identifier':
                                            if (lookAhead().text === '_') {
                                                nextToken();
                                                list.push([]);
                                            } else {
                                                nextToken();

                                                if (lookAhead().type === 'value' || lookAhead().type === 'identifier') {
                                                    list.push(currentToken.text);
                                                } else if (lookAhead().type === 'separator') {
                                                    var id = currentToken.text;

                                                    nextToken();
                                                    list.push(parseSourceCode([id]));
                                                };
                                            };

                                            continue;
                                        case 'separator':
                                            nextToken();
                                            break;
                                        default:
                                    };
                                };

                                if (arguments[0] !== undefined) {
                                    arguments[0].push(list);
                                } else {
                                    return list;
                                };

                                continue;
                            case '[':
                                nextToken();

                                if (arguments[0] !== undefined) {
                                    arguments[0].push(parseSourceCode([]));
                                } else {
                                    return parseSourceCode([]);
                                };

                                continue;
                            case ';':
                                nextToken();

                                if (lookAhead().text === ']') {
                                    arguments[0].push([]);
                                };

                                continue;
                            case '{':
                                nextToken();

                                if (arguments[0] !== undefined) {
                                    arguments[0].push(parseSourceCode(['unquote']));
                                } else {
                                    return parseSourceCode(['unquote']);
                                };

                                continue;
                            case '->':
                                nextToken();

                                if (arguments[0][0] !== '?') {
                                    arguments[0].unshift('?');
                                };

                                arguments[0][arguments[0].length - 1] = [arguments[0][arguments[0].length - 1]];

                                if (lookAhead().text === '[') {
                                    arguments[0][arguments[0].length - 1].push(parseSourceCode([]));
                                } else {
                                    arguments[0][arguments[0].length - 1].push(parseSourceCode());
                                };

                                continue;
                            case ']': case '}':
                                nextToken();
                                return arguments[0];
                            default:
                        };
                    case 'value':
                        nextToken();

                        if (arguments[0] !== undefined) {
                            arguments[0].push(currentToken.text);
                        } else {
                            return currentToken.text;
                        };

                        continue;
                    default:
                };
            };
        };

        return function () {
            var parseTree = [];

            while (true) {
                parseTree.push(parseSourceCode());

                while (lookAhead().type === 'comment') {
                    nextToken();
                };

                if (lookAhead().type === 'separator' && lookAhead().text === '-1') {
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
        }();
    };
}());

Heroin = function (path) {
    var data = fs.readFileSync(path, 'utf8').slice(1);

    Compiler(Preprocessor(data));
};

//Heroin('./test.hrn');

module.exports = Heroin;