%==============================================================================
% Copyright (c) 2018-present Allan CORNET (Nelson)
%==============================================================================
% LICENCE_BLOCK_BEGIN
% This program is free software: you can redistribute it and/or modify
% it under the terms of the GNU General Public License as published by
% the Free Software Foundation, either version 2 of the License, or
% (at your option) any later version.
%
% This program is distributed in the hope that it will be useful,
% but WITHOUT ANY WARRANTY; without even the implied warranty of
% MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
% GNU General Public License for more details.
%
% You should have received a copy of the GNU General Public License
% along with this program.  If not, see <http:%www.gnu.org/licenses/>.
% LICENCE_BLOCK_END
%==============================================================================
[current_path, f, e] = fileparts(nfilename('fullpathext'));
src = [current_path, '/nelson.tmLanguage.json.in'];
dst = [current_path, '/nelson.tmLanguage.json'];
content = fileread(src);
jsonObject = jsondecode(content);
%==============================================================================
[list_builtin, list_macro] = what();
%==============================================================================
list_builtin = sort(list_builtin);
list_builtin(startsWith(list_builtin, '@')) = [];
list_builtin(startsWith(list_builtin, '__')) = [];
builtin_concat = sprintf('%s|',string(list_builtin));
if endsWith(builtin_concat, '|')
  builtin_concat = builtin_concat(1:end-1);
end
%==============================================================================
list_macro = sort(list_macro);
list_macro(startsWith(list_macro, '@')) = [];
list_macro(startsWith(list_macro, '__')) = [];
macro_concat = sprintf('%s|',string(list_macro));
if endsWith(macro_concat, '|')
  macro_concat = macro_concat(1:end-1);
end
%==============================================================================
content = fileread(src);
content = replace(content, '__MACROS__', macro_concat);
content = replace(content, '__BUILTINS__', builtin_concat);
filewrite(dst, content);
%==============================================================================
disp('nelson.tmLanguage generated.');
%==============================================================================
