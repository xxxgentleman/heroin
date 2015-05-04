var fs = require('fs'),
    Preprocessor, Compiler, Heroin;

(function () {
    var Reader, States, Scanner, Parser;

    Reader = function (string) {
        var data = string,
            currentPosition = 0,
            dataLength = data.length;

        return {
            nextCharacter: function () {
                if (currentPosition >= dataLength) {
                    return '-1';
                };

                return data.charAt(currentPosition++);
            },

            retract: function () {
                currentPosition -= 1;

                if (currentPosition >= dataLength) {
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
		var nextCharacter = reader.nextCharacter,
			retract = reader.retract,
			currentLine = 1,
			state = States.START_STATE,
			numDots = 0;

		return {
			nextToken: function () {
				var bufferString = '';

				while (true) {
					switch (state) {
						case States.START_STATE:
							var character = nextCharacter();

							switch (character) {
								case '-1': case ',': case ';': case '^': case '(': case ')': case '[': case ']': case '{': case '}':
									return { type: 'separator', text: character };
								case '\r': case '\n':
									currentLine += 1;
									break;
								case "'":
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
									state = (/\d/.test(nextCharacter())) ? States.NUMBER_STATE : States.IDENTIFIER_STATE;
									retract();
									break;
								default:
									if (!/\s/.test(character)) {
										state = States.IDENTIFIER_STATE;
										bufferString = character;
									};
							};

							break;
						case States.STRING_STATE:
							var character = nextCharacter();

							while (character !== "'") {
								bufferString += character;
								character = nextCharacter();
							};

							bufferString += character;
							state = States.START_STATE;

							return { type: 'value', text: bufferString };
						case States.COMMENT_STATE:
							var character = nextCharacter();

							while (character !== '\r' && character !== '\n' && character !== '-1') {
								bufferString += character;
								character = nextCharacter();
							};

							state = States.START_STATE;

							return { type: 'comment', text: bufferString };
						case States.NUMBER_STATE:
							var character = nextCharacter();

							while (/[\d\.]/.test(character)) {
								if (character === '.') {
									if (numDots > 1) {
										break;
									} else {
										numDots += 1;
									};
								};

								bufferString += character;
								character = nextCharacter();
							};

							retract();
							state = States.START_STATE;

							return { type: 'value', text: parseFloat(bufferString) };
						case States.IDENTIFIER_STATE:
							var character = nextCharacter();

							while (/[^\,\;\^\(\)\[\]\{\}\"\'\#\r\n\s]/.test(character)) {
								bufferString += character;
								character = nextCharacter();
							};

							retract();
							state = States.START_STATE;

							if (bufferString === 'true' || bufferString === 'false') {
								return { type: 'value', text: bufferString === 'true' };
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
		var nextToken = scanner.nextToken,
			consumed = true,
			advance, lookAhead, parse, parseCond, currentToken, aheadToken, currentType, currentText;

		advance = function () {
			if (consumed) {
				var token = nextToken();

				while (token.type === 'comment') {
					token = nextToken();
				};

				currentToken = token;
			} else {
				currentToken = aheadToken;
				consumed = true;
			};

			currentType = currentToken.type;
			currentText = currentToken.text;
		};

		lookAhead = function (prop) {
			if (consumed) {
				var token = nextToken();

				while (token.type === 'comment') {
					token = nextToken();
				};

				aheadToken = token;
				consumed = false;
			};

			return (prop === 'type') ? aheadToken.type : aheadToken.text;
		};

		parse = function () {
			var list, flag;

			while (true) {
				switch (lookAhead('type')){
					case 'identifier':
						advance();

						switch (lookAhead('text')) {
							case '(':
								list = [currentText];
								advance();
								list.push(parse());
								flag = list[1];

								continue;
							case ',': case ')': case ']': case '->': case '^':
								return [currentText];
							default:
						};

						continue;
					case 'value':
						advance();

						return typeof currentText === 'boolean' ? ['quote', [currentText, null]] : [currentText];
					case 'separator':
						switch (lookAhead('text')) {
							case '(': case '[': case '{':
								advance();
								list = currentText === '{' ? ['progn', [parse()]] : [parse()];
								flag = list[1] ? list[1] : list[0];

								continue;
							case ',': case '^': case ';':
								advance();
								flag.push(currentText === ';' ? [parse()] : parse());
								flag = flag[1];

								continue;
							case '->':
								advance();
								list = parseCond(flag);

								continue;
							case ')': case ']': case '}':
								advance();

								if (flag[0] && !flag[1]) {
									flag[1] = null;
								};

								return currentText === ']' ? ['quote', [list, null]] : list;
							default:
						};
					default:
				};
			};
		};

		parseCond = function (conds) {
			var car, flag;

			while (true) {
				if (lookAhead('text') === ',') {
					advance();
					car = parse();
				} else if (lookAhead('text') === '->') {
					advance();
					flag.push([[car, [parse(), null]]]);
					flag = flag[1];
				} else if (lookAhead('text') === ')') {
					flag[1] = null;

					return conds;
				} else {
					conds = ['cond', [[conds[0], [parse(), null]]]];
					flag = conds[1];
				};
			};
		};

		return {
			nextSentence: function () {
				var sentence = parse();

				if (lookAhead('type') === 'separator' && lookAhead('text') === ';') {
					advance();
				} else {
					return ['Please use a semicolon to end the sentence.'];
				};

				return sentence;
			}
		};
	};

    Preprocessor = function (string) {
        var reader = Reader(string),
            scanner = Scanner(reader);

        return Parser(scanner);
    };
}());

(function () {
    var core = ['quote', '?', 'var', '=', 'fct', 'begin', 'unquote', 'ary', 'obj',
            'atom', '==', 'car', 'cdr', 'cons',
            '+', '-', '*', '/', '%', '<', '>', 'dlt', 'tpof', 'rtn'],
        globalEnvironment = {}, macroTable = {},
        Primitive, FunctionCall, Macro, SymbolExchanger, VariableSearcher, CoreFunction;

    VariableSearcher = function (symbol, environment) {
        if (symbol in environment) {
            return environment;
        } else if (environment['superEnvironment']) {
            return VariableSearcher(symbol, environment['superEnvironment']);
        } else {
            return false;
        };
    };

    SymbolExchanger = function (array, symbol, target) {
        for (var i = 0, imax = array.length; i < imax; i += 1) {
            if (Array.isArray(array[i])) {
                array[i] = SymbolExchanger(array[i], symbol, target);
            };

            if (array[i] === symbol) {
                if (symbol==='body') {
                    for (var j = 0, jmax = target.length; j < jmax; j += 1) {
                        array.splice(i + j, j === 0 ? 1 : 0, target[j]);
                        imax += j;
                    };
                } else {
                    array.splice(i, 1, target);
                };
            };
        };

        return array;
    };

    Primitive = function (symbol, environment) {
        if (/^-?([0-9])(\d+)?(\.\d+)?$/.test(symbol)) {
            return parseFloat(symbol);
        } else if (/^\"/.test(symbol)) {
            return symbol.slice(1, -1);
        } else if (symbol === 'true') {
            return true;
        } else if (symbol === 'false') {
            return false;
        } else {
            var location = VariableSearcher(symbol, environment);

            if (location !== false) {
                return location[symbol];
            };
        };
    };

    FunctionCall = {
        'atom': function (Arguments) {
            return (Array.isArray(Arguments[0]) === false || Arguments[0] === []) ? true : false;
        },

        '==': function (Arguments, environment) {
            if (Array.isArray(Arguments[0]) || Array.isArray(Arguments[1])) {
                return false;
            } else if (Arguments[0] === Arguments[1]) {
                return (Arguments[2] !== undefined) ? this['=='](Arguments.slice(1), environment) : true;
            } else {
                return false;
            };
        },

        'car': function (Arguments) {
            return (Arguments.length === 1) ? false : Arguments.slice(0, 1)[0];
        },

        'cdr': function (Arguments) {
            if (Arguments.length === 1) {
                return false;
            } else if (Arguments.length === 2) {
                return Arguments.slice(1)[0];
            } else {
                return Arguments.slice(1);
            };
        },

        'cons': function (Arguments) {
            for (i = 0, max = Arguments[1].length; i < max; i += 1) {
                Arguments[0].push(Arguments[1][i]);
            };

            return Arguments[0];
        }
    };

    Macro = function (macroName, Arguments) {
        macroTable[macroName] = function () {
            for (var i = 0, max = Arguments[0].length; i < max; i += 1) {
                if (Arguments[0].indexOf('body') !== -1) {
                    if (Arguments[0][i] === 'body') {
                        var exc = Array.prototype.slice.call(arguments, i, i + arguments.length - max + 1);
                    } else {
                        var exc = arguments[(i < Arguments[0].indexOf('body')) ? i : i + arguments.length - max];
                    };
                } else {
                    var exc = arguments[i];
                };

                SymbolExchanger(Arguments[1], Arguments[0][i], exc);
            };

            return Arguments[1];
        };
    };

    CoreFunction = {
        '+': function (Arguments) {
            if (Arguments.length === 0) {
                return 0;
            } else if (Arguments.length === 1) {
                return Arguments[0];
            } else {
                return Arguments.shift() + this['+'](Arguments);
            };
        },

        '-': function (Arguments) {
            if (Arguments.length === 0) {
                return 0;
            } else if (Arguments.length === 1) {
                return -Arguments[0];
            } else {
                return Arguments.shift() - this['+'](Arguments);
            };
        },

        '*': function (Arguments) {
            if (Arguments.length === 0) {
                return 1;
            } else if (Arguments.length === 1) {
                return Arguments[0];
            } else {
                return Arguments.shift() * this['*'](Arguments);
            };
        },

        '/': function (Arguments) {
            if (Arguments.length === 0) {
                return 1;
            } else if (Arguments.length === 1) {
                return 1 / Arguments[0];
            } else {
                return Arguments.shift() / this['*'](Arguments);
            };
        },

        '%': function (Arguments) {
            return Arguments[0] % Arguments[1];
        },

        '<': function (Arguments) {
            if (Arguments.length > 2) {
                if (Arguments[0] < Arguments[1]) {
                    return this['<'](Arguments.slice(1));
                } else {
                    return false;
                };
            } else {
                return Arguments[0] < Arguments[1];
            };
        },

        '>': function (Arguments) {
            if (Arguments.length > 2) {
                if (Arguments[0] > Arguments[1]) {
                    return this['>'](Arguments.slice(1));
                } else {
                    return false;
                };
            } else {
                return Arguments[0] > Arguments[1];
            };
        },

        'dlt': function (Arguments) {
            delete env[Arguments[0]];
        },

        'tpof': function (Arguments) {
            return (Array.isArray(Arguments[0])) ? 'array' : typeof Arguments[0];
        },

        'rtn': function (Arguments) {
            return (Arguments !== []) ? Arguments.unshift('rtn') : 'rtn';
        }
    };

    Compiler = function (parseTree) {
        var Evaluate, Apply, Special;

        Evaluate = function (Expression, environment) {
            if (!Array.isArray(Expression)) {
                return Primitive(Expression, environment);
            } else {
                if (core.indexOf(Expression[0]) !== -1 || Expression[0] === 'macro' || Expression[0] in macroTable || Expression[0] in globalEnv) {
                    return Apply(Expression[0], Expression.slice(1), environment);
                } else if (/\./.test(Expression[0]) || Array.isArray(Expression[0])) {
                    if (/\./.test(Expression[0])) {
                        Expression[0] = Expression[0].split('.');
                    };

                    return Apply(Expression[0], Expression.slice(1), environment);
                };
            };
        };

        Apply = function (Procedure, Arguments, environment) {
            if (Procedure === 'macro') {
                return Macro(Arguments.shift(), Arguments);
            } else if (Procedure in macroTable) {
                return Evaluate(macroTable[Procedure].apply(this, Arguments), environment);
            } else if (Procedure in Special) {
                return Special[Procedure](Arguments, environment);
            } else {
                for (var i = 0, max = Arguments.length; i < max; i += 1) {
                    if (Arguments[i][0] === 'quote') {
                        Arguments = Evaluate(Arguments[i], environment);
                    } else {
                        Arguments[i] = Evaluate(Arguments[i], environment);
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
                        return FunctionCall[Procedure](Arguments, environment);
                    } else if (Procedure in CoreFunction) {
                        return CoreFunction[Procedure](Arguments, environment);
                    } else if (Procedure in globalEnv) {
                        return globalEnv[Procedure](Arguments, environment);
                    };
                };
            };
        };

        Special = {
            'quote': function (Arguments) {
                return (Arguments.length === 1) ? Arguments[0] : Arguments;
            },

            '?': function (Arguments, environment) {
                if (Arguments[1] === undefined) {
                    return (Arguments[0] === []) ? false : Evaluate(Arguments[0]);
                } else if (Evaluate(Arguments[0][0], environment)) {
                    return Evaluate(Arguments[0][1], environment);
                } else {
                    return this['?'](Arguments.slice(1), environment);
                };
            },

            'var': function (Arguments, environment) {
                if (Array.isArray(Arguments[0])) {
                    for (var i = 0, max = Arguments[0].length; i < max; i += 1) {
                        this['var']([Arguments[0][i], Arguments[1][i]], environment);
                    };
                } else {
                    environment[Arguments[0]] = Evaluate(Arguments[1], environment);

                    return Arguments[0];
                };
            },

            '=': function (Arguments, environment) {
                if (Array.isArray(Arguments[0])) {
                    for (var i = 0, max = Arguments[0].length; i < max; i += 1) {
                        this['=']([Arguments[0][i], Arguments[1][i]], environment);
                    };
                } else {
                    var targetEnvironment = VariableSearcher(Arguments[0], environment);

                    if (targetEnvironment !== false) {
                        targetEnvironment[Arguments[0]] = Evaluate(Arguments[1], environment);
                    } else {
                        return false;
                    };
                };
            },

            'fct': function (Arguments, environment) {
                var lambda = function () {
                    environment['subEnvironment'] = { 'superEnvironment': environment };

                    for (var i = 0, max = Arguments[0].length; i < max; i += 1) {
                        Arguments[1] = SymbolExchanger(Arguments[1], Arguments[0][i], arguments[0][i]);
                    };

                    var result = Evaluate(Arguments[1], environment['subEnvironment']);

                    delete environment['subEnvironment'];

                    return result;
                };

                return (Arguments[2]) ? lambda.apply(this, Arguments[2]) : lambda;
            },

            'begin': function (Arguments, environment) {
                for (var i = 0, max = Arguments.length; i < max; i += 1) {
                    if (i === max - 1) {
                        return Evaluate(Arguments[i], environment);
                    } else {
                        var result = Evaluate(Arguments[i], environment);
                        
                        if (Arguments[i][0] === 'rtn') {
                            return result;
                        };
                    };
                };
            },

            'unquote': function (Arguments, environment) {
                return Evaluate(Evaluate(Arguments[0], environment), environment);
            },

            'ary': function (Arguments, environment) {
                var array = [];

                for (var i = 0, max = Arguments.length; i < max; i += 1) {
                    array.push(Evaluate(Arguments[i], environment));
                };

                return array;
            },

            'obj': function (Arguments, env) {
                var object = {};

                for (var i = 0, max = Arguments.length; i < max; i += 1) {
                    this['var'](Arguments[i], object);
                };

                return object;
            }
        };

        return function () {
            var std = Preprocessor(fs.readFileSync('./std.hrn', 'utf8').slice(1));
            
            for (var i = 0, imax = std.length; i < imax; i += 1) {
                Evaluate(std[i], globalEnvironment);
                delete globalEnvironment['subEnvironment'];
            };
            
            for (var j = 0, jmax = parseTree.length; j < jmax; j += 1) {
                Evaluate(parseTree[j], globalEnvironment);
                delete globalEnvironment['subEnvironment'];
            };
            console.log(globalEnvironment);
        }();
    };
}());

Heroin = function (path) {
    var data = fs.readFileSync(path, 'utf8').slice(1);

    //console.log(Preprocessor(data)[0]);      // to test the parser
    Compiler(Preprocessor(data));
};

Heroin('./test.hrn');

module.exports = Heroin;