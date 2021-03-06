define(['jquery'], function ($) {
    
    function unpackURL(url, data) {        
        if (url.indexOf('{') != -1){
            for (var substitut in data) {
                if (data[substitut] != undefined) {
                    url = url.replace('{' + substitut + '}', data[substitut]);
                }                    
            }   
        }
        return url
    }
    function parseLinkHeader(header) {
        return {}
    };
    function parseLinkTemplateHeader(header) {
        return {}
    };
        
    function ApiResult() {
        this.init.apply(this, arguments);
    };
    
    $.extend(ApiResult.prototype, {
        
        init: function(obj){
            
            this.results= [];
            this.obj= obj;
            this.settings= {};
            this.wasSuccessfull= undefined;
            this.request= {};
            this.ajaxID= null;
            this.responseText = undefined;
        },
        
        registerRequest: function(ajaxID, request){
            this.ajaxID = ajaxID,
            $.extend(this.request, request);
        },
        
        registerSettings: function(settings){
            $.extend(this.settings, settings);
        },
        
        registerResult: function(result){            
            this.setStatus('', '', result.wasSuccessfull);
            this.results.push(result);
        },
        
        registerSuccess: function(response, status, jqXHR){
            this.responseText = jqXHR.responseText;
            this.setStatus('ok', status, true);
        },
        
        registerFailure: function(jqXHR, status, error){
            this.setStatus('failed', error, false);
            this.responseText = jqXHR.responseText;
        },
        
        wasCached: function(){
            this.setStatus('ok', 'cached', true);
        },
        
        setStatus: function(status, statusText, success){
            this.status = status;
            this.statusText = statusText.toLowerCase();
            
            if (this.wasSuccessfull === undefined){
                this.wasSuccessfull = success;
            }else{
                this.wasSuccessfull = this.wasSuccessfull && success;
            }
        },
        
        getFormat: function(){
            if (this.settings.format === undefined){
                // pass
            }else if (typeof this.settings.format == 'string'){
                return this.settings.format
            }else if (this.settings.format instanceof Object) {
                if (typeof this.settings.format.format == 'string') {
                    return this.settings.format.format
                }
            }
            
            return 'json';
        },
        
        getContent: function(format){
            if (format === undefined) {
                format = this.getFormat();
            }
            return this.obj.__onLoad(format);
        },
        
        getObject: function(){
            return this.obj.__onGet(true);
        },
        
    });
        
    function Path() {
        this.init.apply(this, arguments);
    };
    
    $.extend(Path.prototype, {        
        init: function(parent, target, _data){
            this.path = new Array();
            if (_data instanceof Object) {  
                var data = _data;             
            }else{
                var data = {};
                if (_data != undefined) {
                    data[target] = _data;
                } 
            }
            
            if (parent != null) {
                for (var pathMember in parent.path){
                    this.path.push(parent.path[pathMember]);
                };
            }
            this.target = target;
            this.data = data;
            
            this.path.push(this);
        },
        getURIs: function(sitemap){
            var active = sitemap;
            var data = {}
            for (var urlPartIndex in this.path){
                var urlPart = this.path[urlPartIndex];
                $.extend(data, urlPart.data);
                if (urlPart.target) {
                    active = active[urlPart.target];
                }
                
            };
            var links = {};
            for (var link in active) {
                url = active[link]['.'];
                if (url) {
                    links[link] = unpackURL(url, data)
                }                
            }
            
            return links
        }
    });
    
    function ApiObject() {
        this.__init.apply(this, arguments);
    };
    
    $.extend(ApiObject.prototype, {   
        
        __reset:  function(){
            this.__data = {};
            this.__links = {};
            this.__URIlinks = {};
            this.__URLlinks = {};
            
            this.__origContent = {'json':{}};
            this.__content = {'json':{}};
            this.__objects = {};
            this.__unevaluatedObjects = {};
            this.__domElements = [];
            
            this.__uncommitted = {};
            this.__committing = {};
            
            this.__format = 'json';
            this.__sync = [];               
            this.__loading = 0;
            this.__initialized = false;
            this.__initializing = undefined;
            this.__saving = false;
            this.__status = {};
            this.__path = null
        },
        
        __init: function(apiClient, parent, target, data, asClone){      
            this.__reset();
            
            if (target == null) {
                this.__data       = data;
            }
            
            this.__apiClient  = apiClient;
            if (asClone) {
                this.__path       = parent.__path;
            }else{
                this.__path       = new Path(parent ? parent.__path : null, target, data);
            }            
            
            this.__updateURILinks();
        },
        
        __updateURILinks: function(){
            var $this = this;
            var data = {}
            for (var entry in $this.__content['json']) {
                data[entry] = $this.__content['json'][entry];
            } // todo: really??
            // todo also include objects - data[object_name] = object.data??
            
            
            function addLink(link, url) {
                url = unpackURL(url, data);
                
                $this.__URIlinks[link] = url;
                if ($this.__links[link] === undefined) {
                    $this.__links[link] = url;
                }
            }
            
            var URIs = this.__path.getURIs($this.__apiClient.getSitemap());
            for (var link in URIs){
                addLink(link, URIs[link]);
            }
        },
        
        /* URLLinks are links from the Response Header.
         * depending links ONLY substitute from resource attributes */
        __updateURLLinks: function(additionalLinks){
            var $this = this;
            var data = {}
            for (var entry in $this.__content['json']) {
                data[entry] = $this.__content['json'][entry];
            }
            /*for (var urlPartIndex in $this.__path.path){
                var urlPart = $this.__path.path[urlPartIndex];
                data[urlPart.target] = urlPart.data;
            };*/
            
            function addLink(link, url) {
                if (url.indexOf('{') != -1){
                    for (var substitut in data) {
                        if (data[substitut] != undefined) {
                            url = url.replace('{' + substitut + '}', data[substitut]);
                        }                    
                    }   
                }
                $this.__URLlinks[link] = url;
                $this.__links[link] = url;
            }
            
            for (var link in additionalLinks){
                addLink(link, additionalLinks[link]);
            }
            
        },
        
        __asURL: function(target){
            if (target && this.__URLlinks[target]) {
                return this.__URLlinks[target]
            }
            
            var links = this.__URLlinks;
            var url = '';
        
            if (links['.']) {
                url = links['.'];
                if (url === undefined) {
                    throw Error('this one is not accessible')
                }
                if (url.indexOf('{') != -1) {
                    throw Error('provided data  does not match')
                }
                return url
            }else{
                //?
            }
            
            return null;
        },
        
        __asURI: function(target){
            if (target && this.__URIlinks[target]) {
                return this.__URIlinks[target]
            }
            
            var url = '';            
            for (var urlPart in this.__path.path){
                var path = this.__path.path[urlPart];
                var part = path.target;
                if (path.data[path.target] != undefined) {
                    part = path.data[path.target];
                }
                url += '/' + part;
            };
            url += '/';
            return url;
        },
        
        __asResult: function(action, settings){
            var result = new ApiResult(this);
            result.registerSettings(settings);
            return result
        },
        
        __isCreated: function(){// todo
            return this.__sync.length > 0;
        },
        
        __create: function(data, callback){
            var obj = new LinkedResource(this.__apiClient, this, null, data);
            
            request = {
                data: data,
                type: 'post',
                isApiInternal: true
            }
            var result = obj.__asResult('create', {data:data, callback:callback});
            request.done = function(response, status, jqXHR){
                obj.__updateFromResponse(response, jqXHR);
                result.registerSuccess(response, status, jqXHR);
                if (callback instanceof Function) {
                    callback(result);
                }
            }
            request.fail = function(jqXHR, statusText, errorThrown){
                result.registerFailure(jqXHR, statusText, errorThrown);
                if (callback instanceof Function) {
                    callback(result);
                }
            }
            
            this.__setURL(request);
            
            var ajaxID = this.__apiClient.add(request);            
            obj.__sync.push(ajaxID);
            result.registerRequest(ajaxID, request);
            return obj
        },
        
        __setURL: function(request, target){
            var data = {}
            $.extend(data, this.__data);
            if (request.data) {
                $.extend(data, request.data);
            }else{
                request.data = {}
            }
            $.extend(request.data, data);
            
            var url = this.__asURL(target);
            if (url) {
                request.url = url
            }else{
                var uri = this.__asURI(target);
                if (uri) {
                    request.uri = uri;
                }else{
                    throw Error('has neither uri nor url');
                }
            }
        },
        
        __save: function(callback){    
            var $this = this;            
            var apiClient = $this.__apiClient;
            var todo = 1; // starting at 1!!
            
            var settings = {callback: callback};
            
            var result = this.__asResult('save', settings);
            
            function onChange(target, new_state){
                return; //todo?
                return status_change($this.__get(target), new_state);
            }
            
            function finnishedOne(childrenResult) {
                todo -= 1;
                result.registerResult(childrenResult)
                if (todo == 0 && callback instanceof Function) {
                    callback(result);
                }
            }
        
            if ($this["saving"] == true) {
                throw Error('already saving, wait');
                //$this.__abort($this.__committing[target])
            }
            
            
            var data = {};
            var seperateRequest = [];
            var saveObject = false;
            for (var target in $this.__uncommitted) {
                if ($this.__content['json'][target] == undefined) {
                    seperateRequest.push(target)
                }else{
                    data[target] = $this.__uncommitted[target];
                    saveObject = true;
                }
                
                $this.__committing[target] = $this.__uncommitted[target];
                delete $this.__uncommitted[target];
            }
            
            var completeUpdate = true;
            for (var entry in $this.__content['json']){
                if (data[entry] === undefined){
                    completeUpdate = false;
                    break;
                }
            }
            
            function finnishedSaving(result, data){
                return function(response, status, jqXHR){
                    $this.__finnishedLoading();
                    result.registerSuccess(response, status, jqXHR);
                    $this.__updateFromResponse(response, jqXHR);
                    
                    for (var target in data) {
                        delete $this.__committing[target];
                    }
                    finnishedOne(result);
                }
            }
            
            function failedSaving(result, data){
                return function(jqXHR, status, error){
                    $this.__finnishedLoading();
                    result.registerFailure(jqXHR, status, error);
                    
                    for (var target in data) {
                        if ($this.__uncommitted[target] === undefined){
                            $this.__uncommitted[target] = data[target];
                        };
                        delete $this.__committing[target];
                    }
                    finnishedOne(result);
                }
            }
            /*
            function saveRelated() {
                
                for (target in seperateRequest) {
                    
                    $this.__startLoading()
                    todo += 1;
                    var data = {};
                    data[target] = $this.__committing[target];
                    
                    var request = {
                        type: 'post', // todo
                        data: data,
                        done: function(response, status, jqXHR){
                            finnishedSaving(data);
                            $this.__updateFromResponse(response, jqXHR);
                        },
                        isApiInternal: true
                    };
                    $this.__setURL(request, target);
                    sync_obj = apiClient.add(request);
                    
                    var number = $this.__sync.push(sync_obj);
                    $this.__committing[target] = $this.__sync[number];
                    
                    var state = {
                        "status": "found",
                        "timestamp": +new Date()/1000,
                    };
                    $this.__onChange(target, state);
                    onChange(target, state);
                    
                }
                
                // because we started todo = 1;
                finnishedOne();
            };*/
            
            if (saveObject) {
                
                if (!$this.__isCreated()){
                    // it wasn't fetched from server - so it needs to be created
                    method = 'post'
                }else{
                    if (completeUpdate) {
                        method = 'put'
                    }else{
                        method = 'patch'
                    }
                }
                $this.__startLoading();
                todo += 1;
                var request = {
                    type: method,
                    data: data,
                    done: finnishedSaving(result, data),
                    fail: failedSaving(result, data),                    
                    isApiInternal: true
                }
                $this.__setURL(request);
                sync_obj = apiClient.add_urgent(request)
                result.registerRequest(sync_obj, request);
                
                var number = $this.__sync.push(sync_obj);
                for (var target in data) {
                    $this.__committing[target] = $this.__sync[number];
                    var state = {
                        "status": "found",
                        "timestamp": +new Date()/1000,
                    };
                    $this.__onChange(target, state);
                    onChange(target, state);
                }
                
            }else{
                //saveRelated();
                throw Error('nothing to save');
            }
            
            return this;
        },
        
        __all: function(targetOrSettings, _data){
            return this.__get(targetOrSettings, _data, true)
        },
        
        __parseFormat: function(format){
            if (typeof format == 'string'){
                return format
            }else if (format instanceof Object) {
                var args = "", _format = undefined;
                for (var entry in format) {
                    if (entry == 'format') {
                        _format = format[entry];
                    }else{
                        args += entry;
                        args += ':';
                        args += format[entry];
                        args += ';';
                    }
                }
                if (_format) {
                    if (args) {
                        return _format + '|' + args
                    }
                    return _format
                }
            }
            
            return 'json'
        },
        
        __getID: function(){
            return 1;
        },
        
        __parseTarget: function(target, data){
            if (data instanceof Object) {
                var args = "";
                for (var entry in data) {
                    args += entry;
                    args += ':';
                    args += data[entry];
                    args += ';';
                }
                if (args) {
                    return target + '|' + args
                }
            }
            return target
        },
        
        __get: function(targetOrSettings, _data, wrapped){
            // init            
            var $this       = this;
            var data        = {};//, callback, onChange, forceLoad
            var target      = null;
            var apiClient   = $this.__apiClient;
            var settings    = {};
            
            
            if ((!_data) && targetOrSettings instanceof Object) {
                $.extend(settings, targetOrSettings);
                target          = targetOrSettings.target;
                _data           = targetOrSettings.data;
            }else{
                target = targetOrSettings;
            }
            
            if (_data instanceof Object) {
                data = _data;
            }else if (_data != null && _data != undefined){
                data[target] = _data;
            }
            var format = this.__parseFormat(settings.format);
            var targetID = this.__parseTarget(target, data);
            
            // logic
            
            if (target) {
                if (($this.__links[target] != undefined) && ($this.__objects[targetID] === undefined)){
                
                    $this.__objects[targetID] = new LinkedResource(this.__apiClient, this, target, data);
                    
                }else if ($this.__objects[targetID] === undefined && $this.__initialized != true) {
                    var attribute = new ResourceAttribute($this.__apiClient, $this, target, null);
                    
                    $this.__unevaluatedObjects[targetID] = attribute;
                    $this.__objects[targetID] = attribute;
                        
                }else if ($this.__objects[targetID] === undefined && $this.__content[target] != undefined) {
                    var attribute = new ResourceAttribute($this.__apiClient, $this, target, null);
                    $this.__objects[targetID] = attribute;
                }
                
                if ($this.__objects[targetID] != undefined) {
                    var state = {
                        "status": "found",
                        "timestamp": +new Date()/1000,
                    };                                 
                    return $this.__objects[targetID].__onGet(wrapped, format);
                
                }else{console.log(targetID);
                    throw Error('target "'+ target +'" not found');
                }   
            }else{
                return new ApiObject(this.__apiClient, this, null, data, true)
            }
            
                     
            
        },
        
        
        __onGet: function(wrapped, format, onLoad){
            if (format === undefined) {
                format = 'json'
            }            
            if (wrapped === undefined) {
                wrapped = true;
            }
            
            if (wrapped === false) {
                var content = {};
                
                if (format === 'json') {
                    for (var obj in this.__content[format]) {
                        content[obj] = this.__content[format][obj];               
                    }
                    for (var obj in this.__objects) {
                        if (onLoad) {
                            content[obj] = this.__objects[obj].__onLoad(format)
                            
                        }else{
                            content[obj] = this.__objects[obj].__onGet(wrapped, format)
                        }                    
                    }
                    return content
                }else{
                    return this.__content[format]
                }
            }
            return this
        },
        
        __onLoad: function(format){
            return this.__onGet(false, format, true);
        },
        
        __prepare: function(targets, callback){
            // init
            var $this = this;   
            var apiClient = $this.__apiClient;
            var settings = {};
                        
            
            if (!(targets instanceof Array)){
                targets = [targets];
            }
            
            // logic
            var targetLength = targets.length;
            var todo = targetLength;
            
            settings.callback = callback;
            settings.targets = targets;
            
            var result = this.__asResult('prepare', settings);
            
            function finnishTarget(targetResult) {
                todo -= 1;
                
                var callbacks = targetResult.settings.callbacks;
                for (var targetCallbackEntry in callbacks){
                    var targetCallback = callbacks[targetCallbackEntry];
                    if (targetCallback instanceof Function) {
                        targetCallback(targetResult); 
                    } 
                }
                
                result.registerResult(targetResult);
                // when all targets are done, call the prepare callback
                if (todo == 0) {
                    if (callback instanceof Function) {
                        callback(result);
                    }                    
                }
            }
            
            for (var i in targets) {
                var target = targets[i];
                var dependingTargets = null;
                var targetSettings = {}
                
                if (target instanceof Object) {
                    targetSettings = $.extend(targetSettings, target);
                }else{
                    targetSettings['target'] = target;
                };
                if (targetSettings.callbacks === undefined) {
                    targetSettings.callbacks = new Array();
                }
                targetSettings.callbacks.push(targetSettings.callback);
                
                targetSettings.callback = function(result){
                    if (targetSettings.depending != undefined) {
                        result.prepare(targetSettings.depending, function(dependingResult){
                                                                    result.appendResult(dependingResult);
                                                                    finnishTarget(result);});
                    }else{
                        finnishTarget(result);
                    }     
                };
                
                target = $this.__get(targetSettings);                
                target.__load(targetSettings);
            }
            
            return $this;
        },
        
        __load: function(callbackOrSettings){
            var settings = {};
            if (callbackOrSettings instanceof Function) {
                settings.callback = callbackOrSettings
            }else if (callbackOrSettings instanceof Object) {
                $.extend(settings, callbackOrSettings);
            }else{
                throw Error('load needs a callback or settings obj')
            }
            
            if (this.__initializing != undefined) {
                var result = this.__asResult('load', settings);
                var callbacks = {};
                callbacks.done = function(response, status, jqXHR){
                    result.registerSuccess(response, status, jqXHR);
                    settings.callback(result);
                }
                callbacks.fail = function(jqXHR, statusText, errorThrown){
                    result.registerSuccess(jqXHR, statusText, errorThrown);
                    settings.callback(result);
                }
                
                this.__apiClient.registerCallbacksForRequest(this.__initializing, callbacks);
                
            }else if (this.__initialized && (settings.forceReload === undefined || settings.forceReload === false)) {
                var result = this.__asResult('load', settings);
                result.wasCached();
                settings.callback(result);
            }else{
                return this.__refresh(settings);
            }      
            return this        
        },
        
        __refresh: function(callbackOrSettings){
            var $this = this;
            var settings = {};
            
            if (callbackOrSettings instanceof Function) {
                settings.callback = callbackOrSettings;
            }else if (callbackOrSettings instanceof Object){
                $.extend(settings, callbackOrSettings);
            }else throw Error('".refresh()" need callback or settings attr')
            
            if (settings.loadContent === undefined) {
                settings.loadContent = true;
            }
            
            var result = this.__asResult('refresh', settings);
            
            
            $this.__startLoading();
            var request = {
                type: settings.loadContent ? 'get' : 'head',
                data: $this.__data,
                done: function (response, text, jqXHR) {                
                    $this = $this.__updateFromResponse(response, jqXHR, settings);
                    $this.__finnishedLoading();
                    result.registerSuccess(response, text, jqXHR);
                    if (settings.callback instanceof Function) {
                        settings.callback(result);      
                    }               
            
                },
                fail: function (jqXHR, statuText, errorThrown) {                
                    $this.__finnishedLoading();
                    result.registerFailure(jqXHR, statuText, errorThrown);
                    if (settings.callback instanceof Function) {
                        settings.callback(result);      
                    }               
            
                },
                isApiInternal: true,
            };
            $this.__setURL(request);
            if (settings.format) {
                var format = settings.format;
                if (typeof format == 'string') {
                    format = {format: format};
                }
                request.dataType = format.format;
                delete format.format
                for  (var arg in format) {
                    // doto: ass query args
                }
            }
            var ajaxID = $this.__apiClient.add(request);
            $this.__sync.push(ajaxID);
            result.registerRequest(ajaxID, request);
            if ($this.__initializing === undefined) {
                $this.__initializing = ajaxID;
            };            
            
            return $this
        },
        
        __updateContent: function(content, dataType, uncommitted, settings){
            if (uncommitted === undefined) {
                uncommitted = true;
            }
            if (settings === undefined) {
                settings = {};
            }
            
            var formatID = this.__parseFormat(settings.format);
            var format = formatID.split('|')[0]
            if (format && dataType.indexOf(format) == -1) {
                if (content[format] != undefined) {
                    return this.__updateContent(content[format], settings.format, uncommitted, settings)
                }
                throw Error('response had invalid dataType (' + dataType + '). Need ' + formatID) // todo
            }
                        
            if (dataType.indexOf('json') != -1) {
                
                $.extend(this.__content['json'], content);
                
                if (content instanceof Array) {
                    for (var entry in content) {
                        var obj = new ApiObject(this.__apiClient, this, null, content[entry], true);
                        obj.__updateContent(content[entry], dataType, uncommitted, settings);
                        obj.__initialized = true;
                        this.__objects[obj.__getID()] = obj;
                    }
                    
                }else if (content instanceof Object) {
                    for (var entry in content) {
                        var obj = this.__get(entry);
                        
                        obj.__updateContent(content[entry], settings.format, uncommitted, settings);
                        if (uncommitted) {
                            this.__uncommited[entry] = content[entry];
                        }
                    }
                }   
            }else{
                this.__content[formatID] = content;
            }
            return this
            
        },
        
        __updateFromResponse: function(response, jqXHR, settings){
            var $this = this;
            
            additionalLinks = {};
            
            if (jqXHR.url) {
                additionalLinks['.'] = jqXHR.url;
            }
            
            // todo:
            /*                
                $this.__onChange(target, state);
                if (settings.onChange) settings.onChange(state);*/
            this.__updateContent(response, jqXHR.getResponseHeader('Content-Type'), false, settings);
            // todo store as AttibuteObjects
            /*if (isLink) {
                $.extend($this['objects'], response)
            }else{
                $.extend($this['content'], response);
            }        */                           
            
            $.extend(additionalLinks, parseLinkHeader(jqXHR.getResponseHeader('Link')));
            $.extend(additionalLinks, parseLinkTemplateHeader(jqXHR.getResponseHeader('Link-Template')));                             
            this.__updateURLLinks(additionalLinks);
            
            $this.__initialized = true;
            $this.__initializing = undefined;
            
            return $this
        },
         
        __inspect: function(callbackOrSettings){
            var settings = {};
            if (callbackOrSettings instanceof Object) {
                $.extend(settings, callbackOrSettings);
            }else{
                settings['callback'] = callbackOrSettings;
            }
            settings['loadContent'] = false;
            return this.__refresh(settings);
        },
        
        __onChange: function(target, state){
            var $this = this;
            
            if ($this.__status[target] == undefined) {
                $this.__status[target] = $this.__status[target] || [];
            }
            
            $this.__status[target].push(state);
        },
        
        __set: function(target, value, callback){
            var $this = this;
                
            if ($this.__content[target] != undefined) {
                if ($this.__content[target] != value) {
                    $this.__update(target, value);
                }
            }else if ($this.__links[target] != undefined){
                $this.__update(target, value);
            }
            return $this;
        },
        
        __update: function(target, value){
            var $this = this;
            
            //targetObj = $this.__get(target);
            //if (targetObj instanceof ResourceAttribute) {
            //    targetObj.__update(value);
            //}
            
            if ($this.__origContent['json'][target] && $this.__origContent['json'][target] == value) {
                if ($this.__uncommitted[target] != undefined) {
                    delete $this.__uncommitted[target];
                };
            }else{                
                $this.__origContent['json'][target] = $this.__content['json'][target];
                $this.__uncommitted[target] = value;
            }
                        
            $this.__content['json'][target] = value;
            
            
            
            //if ($this.__uncommitted[target] != undefined){
                //apiClient.abort($this.__uncommitted[target]);
                
            //    this.__uncommitted[target] = $this.__postRequestObject()
            //}
            
        },
        
        __finnishedLoading: function(){
            this.__loading -= 1;
        },
        
        __startLoading: function(){
            this.__loading += 1;
        },
        
        __getContent: function(){
            return this.__content;
        },
        
        __connect: function(domElement, callback){
            domElement = $(domElement);
            this.__domElements.push(domElement);
            
            var inputTargets = new Array();
            $.each(domElement.find(':input'), function(index, elem){
                var name = $(elem).attr('name');
                if (name)inputTargets.push(name);
            });            
             
            this.__prepare(inputTargets, function(result){
                
                var $this = result.getObject();
                
                for (var obj in $this.__objects) {
                    var target = obj.split('|')[0];
                    var input = domElement.find(':input[name="'+target+'"]');
                    if (input.size()) {
                        $this.__objects[obj].connect(input);
                    }
                }
                if (callback instanceof Function) {
                    callback(result);
                }
                
            }, true);
            
            var submitButton = domElement.find(':submit');
            if (submitButton.size()) {
                var $this = this;
                submitButton.on('click.introspective-api-object.'+this.__getID(), function(event){
                    event.stopImmediatePropagation();
                    try{
                        $this.__save();
                    }catch (e){
                        console.log(e)
                    }
                    return false;
                });
            }

        },
        
        __disconnect: function(domElement){
            domElement = $(domElement);
            
            domElement.off('.introspective-api-object.'+this.__getID())
            
            for (var element in this.__domElements) {
                if (this.__domElements[element] == domElement) {
                    delete this.__domElements[element];
                }
            }
            
            for (var obj in this.__objects) {
                var target = obj.split('|')[0];
                var input = domElement.find(':input[name="'+target+'"]');
                if (input.size()) {
                    this.__objects[obj].disconnect(input);
                }
            }
            
        },
        
        __hasUnsavedChanges: function(){
            for (var entry in this.__uncommitted) {
                return true
            }
            
            return false;
        },
        
        __asForm: function(target){
            if (target) {
                return this.__get(target).__asForm()
            }
            return null
        },
        
        hasUnsavedChanges: function(){
            return this.__hasUnsavedChanges.apply(this, arguments);
        },
        
        all: function(){
            return this.__all.apply(this, arguments)
        },
        get: function(){
            return this.__get.apply(this, arguments)
        },
        
        load: function(){
            return this.__load.apply(this, arguments)
        },
        
        create: function(){
            return this.__create.apply(this, arguments)
        },
        
        save: function(){
            return this.__save.apply(this, arguments)
        },
        
        //update: function(){
        //    return this.__update.apply(this, arguments)
        //},
        
        //updateContent: function(){
        //    return this.__updateContent.apply(this, arguments)
        //},
        
        prepare: function(){
            return this.__prepare.apply(this, arguments)
        },
        
        refresh: function(){
            return this.__refresh.apply(this, arguments)
        },
        
        getContent: function(){
            return this.__getContent.apply(this, arguments)
        },
        
        connect: function(){
            return this.__connect.apply(this, arguments)
        },
        
        disconnect: function(){
            return this.__disconnect.apply(this, arguments)
        },
        
        asForm: function(){
            return this.__asForm.apply(this, arguments)
        }
        
        
    });
    
    function ResourceAttribute() {
        this.__init.apply(this, arguments);
    };
    
    $.extend(ResourceAttribute.prototype, ApiObject.prototype);
    $.extend(ResourceAttribute.prototype, {
        __init: function(apiClient, parent, target, data){
            this.__reset();
            this.__apiClient  = apiClient;
            this.__data       = data;
            this.__parent     = parent;
            this.__target_name= target;
            this.__path       = new Path(parent.path, target, data);
            this.__updateURILinks();
        },
        
        __load: function(callbackOrSettings){
            var $this = this;
            var settings = {};
            
            if (callbackOrSettings instanceof Function) {
                settings['callback'] = callbackOrSettings
            }else{
                $.extend(settings, callbackOrSettings);                
            }
            var callback = settings['callback'];
            var result  = this.__asResult('load', settings)
            
            settings.callback = function(parentResult){
                result.registerResult(parentResult);
                if (callback instanceof Function) {
                    callback(result);
                }
                
            }
            
            return this.__parent.__load(settings);
        },
        
        __onGet: function(wrapped, format, onLoad){            
            if (wrapped === undefined) {
                wrapped = true; // really?
            }
            if (wrapped === false) {
                
                return this.__content
            }
            return this
        },
        
        __refresh: function(callbackOrSettings){
            var $this = this;
            var settings = {};
            
            if (callbackOrSettings instanceof Object) {
                $.extend(settings, callbackOrSettings);
            }else{
                settings['callback'] = callbackOrSettings
            }
            var callback = settings['callback'];
            
            var result = this.__asResult('refresh', settings);
            settings.callback = function(parentResult){
                result.registerResult(parentResult);
                callback(result);
            }
            
            return this.__parent.__refresh(settings);
        },
         
        __updateContent: function(content){
            this.__content = content;
        },
        
        __update: function(newContent){
            var $this = this;
            $this.__updateContent(newContent);
            
            var content = $this.__onGet(false);
            $this.__parent.__update($this.__target_name, content)
            $this.__updateConnected(content);
        },
        
        __save: function(){
            this.__parent.__save() // todo;
        },
        
        __get_updatedHandler: function($this, autoSubmit){
            return function(event){
                
                var domElement = $(event.target);
                var currentContent = $this.__onGet(false);
                var newContent = domElement.val();
                
                if (currentContent != newContent) {
                    $this.__update(newContent);
                    
                    if (autoSubmit)
                        $this.__save();
                }           
    
                return true
            }
        },
        
        __updateConnected: function(content){            
            for (var element in this.__domElements) {
                this.__domElements[element].val(content).change()
            };
        },
        
        __connect: function(domElement, callback, autoSubmit){
            domElement = $(domElement);
            this.__domElements.push(domElement);
            
            domElement.on('change.introspective-api-object.' + this.__parent.__getID(), this.__get_updatedHandler(this, autoSubmit));
            
            this.__load(function(result){
                domElement.val(result.getContent()).change();
                if (callback instanceof Function) {
                    callback(result);
                }   
            })
            
           

        },
        
        __disconnect: function(domElement){
            for (var element in this.__domElements) {
                if (this.__domElements[element] == domElement) {
                    delete this.__domElements[element];
                }
            }
            domElement.val(null);     
            domElement.off('.introspective-api-object.' + this.__parent.__getID());
            
        },
        
        __asForm: function(){
            ret = $('<input type="text">');
            this.__connect(ret, function(){}, true);
            return ret           
        }
        
    });
    
    function LinkedResource() {
        this.__init.apply(this, arguments);
    };
    
    $.extend(LinkedResource.prototype, ApiObject.prototype);
    /*$.extend(LinkedResource.prototype, {
        __init: function(apiClient, parent, target, data){
            this.__reset();
            
            this.__apiClient  = apiClient;
            this.__parent     = parent;
            this.__path       = new Path(parent.path, target, data);
            
            this.__updateURILinks();
        },
    })*/
    
    
    
    return ApiObject;
});