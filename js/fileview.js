/**
 * fileview.js
 *
 * Copyright 2008- Samuli Järvelä
 * Released under GPL License.
 *
 * License: http://www.mollify.org/license.php
 */

!function($, _gm) {

	"use strict";
	
	_gm.ui.views.main.FileView = function(_m) {
		this.id = "files";
		
		var that = this;
		this._currentFolder = false;
		this._currentFolderData = false;
		this._viewStyle = 0;
		this._selected = [];
		this._customFolderTypes = {};
		this._selectedItems = [];
		this._formatters = {
			byteSize : new _m.ui.formatters.ByteSize(new _m.ui.formatters.Number(2, false, _m.ui.texts.get('decimalSeparator'))),
			timestamp : new _m.ui.formatters.Timestamp(_m.ui.texts.get('shortDateTimeFormat')),
			uploadSpeed : new _m.ui.formatters.Number(1, _m.ui.texts.get('dataRateKbps'), _m.ui.texts.get('decimalSeparator'))
		};
		
		this._filelist = {
			columns : [],
			addColumn : function(c) {
				that._filelist.columns[c.id] = c;
			}
		};
		
		// spec
		this._filelist.addColumn({
			"id": "name",
			"title-key": "fileListColumnTitleName",
			"sort": function(i1, i2, sort, data) {
				return i1.name.toLowerCase().localeCompare(i2.name.toLowerCase()) * sort;
			},
			"content": function(item, data) {
				return item.name;
			}
		});
		this._filelist.addColumn({
			"id": "path",
			"title-key": "fileListColumnTitlePath",
			"sort": function(i1, i2, sort, data) {
				var p1 = _m.filesystem.rootsById[i1.root_id].name + i1.path;
				var p2 = _m.filesystem.rootsById[i2.root_id].name + i2.path;
				return p1.toLowerCase().localeCompare(p2.toLowerCase()) * sort;
			},
			"content": function(item, data) {
				return '<span class="item-path-root">'+_m.filesystem.rootsById[item.root_id].name + '</span>: <span class="item-path-val">' + item.path + '</span>';
			}
		});
		this._filelist.addColumn({
			"id": "type",
			"title-key": "fileListColumnTitleType",
			"sort": function(i1, i2, sort, data) {
				var e1 = i1.is_file ? (i1.extension || '') : '';
				var e2 = i2.is_file ? (i2.extension || '') : '';
				return e1.toLowerCase().localeCompare(e2.toLowerCase()) * sort;
			},
			"content": function(item, data) {
				return item.is_file ? (item.extension || '') : '';
			}
		});
		this._filelist.addColumn({
			"id": "size",
			"title-key": "fileListColumnTitleSize",
			"min-width": 75,
			"sort": function(i1, i2, sort, data) {
				var s1 = (i1.is_file ? parseInt(i1.size, 10) : 0);
				var s2 = (i2.is_file ? parseInt(i2.size, 10) : 0);
				return (s1-s2) * sort;
			},
			"content": function(item, data) {
				return item.is_file ? that._formatters.byteSize.format(item.size) : '';
			}
		});
		this._filelist.addColumn({
			"id": "file-modified",
			"request-id": "core-file-modified",
			"title-key": "fileListColumnTitleLastModified",
			"width": 180,
			"sort": function(i1, i2, sort, data) {
				if (!i1.is_file && !i2.is_file) return 0;
				if (!data || !data["core-file-modified"]) return 0;
				
				var ts1 = data["core-file-modified"][i1.id] ? data["core-file-modified"][i1.id] * 1 : 0;
				var ts2 = data["core-file-modified"][i2.id] ? data["core-file-modified"][i2.id] * 1 : 0;
				return ((ts1 > ts2) ? 1 : -1) * sort;
			},
			"content": function(item, data) {
				if (!item.id || !item.is_file || !data || !data["core-file-modified"] || !data["core-file-modified"][item.id]) return "";
				return that._formatters.timestamp.format(_m.helpers.parseInternalTime(data["core-file-modified"][item.id]));
			}
		});
		this._filelist.addColumn({
			"id": "item-description",
			"request-id": "core-item-description",
			"title-key": "fileListColumnTitleDescription",
			"sort": function(i1, i2, sort, data) {
				if (!i1.is_file && !i2.is_file) return 0;
				if (!data || !data["core-item-description"]) return 0;
				
				var d1 = data["core-item-description"][i1.id] ? data["core-item-description"][i1.id] : '';
				var d2 = data["core-item-description"][i2.id] ? data["core-item-description"][i2.id] : '';
				return ((d1 > d2) ? 1 : -1) * sort;
			},
			"content": function(item, data) {
				if (!item.id || !data || !data["core-item-description"] || !data["core-item-description"][item.id]) return "";
				var desc = data["core-item-description"][item.id];
				var stripped = desc.replace(/<\/?[^>]+(>|$)/g, '');
				return '<div class="item-description-container" title="'+stripped+'">'+desc+'</div>';
			}
		});
		this._filelist.addColumn({
			"id": "go-into-folder",
			"title": "",
			"width": 25,
			"sort": function(i1, i2, sort, data) {
				return 0;
			},
			"content": function(item, data) {
				if (item.is_file) return "";
				return '<div class="go-into-folder"><i class="icon-level-down"></i></div>';
			},
			"on-init": function(list) {
				list.$i.delegate(".go-into-folder", "click", function(e) {
					var item = list.getItemForElement($(this));
					if (!item || item.is_file) return;
					that.changeToFolder(item);
					return false;
				});
			}
		});
		
		this.init = function(mainview) {
			that.title = _m.ui.texts.get('mainviewMenuTitle');
			that.icon = "icon-file-alt";
			that._viewStyle = 0;
			if (_m.settings["file-view"]["default-view-mode"] == "small-icon") that._viewStyle = 1;
			if (_m.settings["file-view"]["default-view-mode"] == "large-icon") that._viewStyle = 2;

			_m.events.addEventHandler(that.onEvent);
			
			that.addCustomFolderType("search", {
				onSelectFolder : function(f) {					
					var df = $.Deferred();
					if (!f) return df.resolve({type:"search", id:""}, {items:[], info:[]});
					
					var text = decodeURIComponent(f);
					_m.service.post("filesystem/search", {text: text, rq_data: that.getDataRequest()}).done(function(r) {
                        var items = [];
                        for (var id in r.matches) {
                            items.push(r.matches[id].item);
                        }
                        var fo = {
							id: f,
							type: "search"
						};
						var data = {
							text: text,
							items: items,
							data: r.data,
							info: r
						};
						df.resolve(fo, data);
					});
					return df.promise();
				},
		
				onRenderFolderView : function(f, fi, $h, $tb) {
					_m.dom.template("mollify-tmpl-main-searchresults", { folder: f, info: fi }).appendTo($h);
					$("#mollify-searchresults-title-text").text(_m.ui.texts.get('mainViewSearchResultsTitle', [""+fi.info.count]));
					$("#mollify-searchresults-desc-text").text(_m.ui.texts.get('mainViewSearchResultsDesc', [fi.text]));
					
					var $fa = $("#mollify-fileview-folder-actions");
					that.addCommonFileviewActions($fa);
				},
				
				onItemListRendered : function(f, fi, items) {
					// tooltips
					var matchList = function(l) {
						var r = "";
						var first = true;
						$.each(l, function(i, li) {
							if (!first) r = r + ", ";
							r = r + li.type;
							first = false;
						});
						return r;
					};
					var matchesTitle = _m.ui.texts.get('mainViewSearchResultTooltipMatches');
					$(".mollify-filelist-item").each(function() {
						var $i = $(this);
						var item = $i.tmplItem().data;
						var title = _m.filesystem.rootsById[item.root_id].name + '/' + item.path + ', ' + matchesTitle + matchList(fi.info.matches[item.id].matches);

						_m.ui.controls.tooltip($i, { title: title });
					});
				}
			});
			
			$.each(_m.plugins.getFileViewPlugins(), function(i, p) {
				if (p.fileViewHandler.onInit) p.fileViewHandler.onInit(that);
				
				if (!p.fileViewHandler.filelistColumns) return;
				var cols = p.fileViewHandler.filelistColumns();
				if (!cols) return;
				
				for (var j=0;j<cols.length;j++)
					that._filelist.addColumn(cols[j]);
			});
			
			that.itemContext = new _m.ui.itemContext();
		}

		this.addCustomFolderType = function(id, h) {
			this._customFolderTypes[id] = h;
		}
		
		this.onResize = function() {}
		
		this.onActivate = function(h) {
			_m.dom.template("mollify-tmpl-fileview").appendTo(h.content);
			that.showProgress();
			// TODO expose file urls
			
			var navBarItems = [];
			$.each(_m.filesystem.roots, function(i, f) {
				navBarItems.push({title:f.name, obj: f, callback:function(){ that.changeToFolder(f); }})
			});
			that.rootNav = h.addNavBar({
				title: _m.ui.texts.get("mainViewRootsTitle"),
				items: navBarItems,
				onRender: _m.ui.draganddrop ? function($nb, $items, objs) {
					_m.ui.draganddrop.enableDrop($items, {
						canDrop : function($e, e, obj) {
							if (!obj || obj.type != 'filesystemitem') return false;
							var item = obj.payload;
							var me = objs($e);
							return that.canDragAndDrop(me, item);
						},
						dropType : function($e, e, obj) {
							if (!obj || obj.type != 'filesystemitem') return false;
							var item = obj.payload;
							var me = objs($e);
							return that.dropType(me, item);
						},
						onDrop : function($e, e, obj) {
							if (!obj || obj.type != 'filesystemitem') return;
							var item = obj.payload;
							var me = objs($e);							
							that.onDragAndDrop(me, item);
						}
					});
				} : false
			});
			
			that.initViewTools(h.tools);
			that.initList();
			
			that.uploadProgress = new UploadProgress($("#mollify-mainview-progress"));
			that._dndUploader = false;
			
			if (_m.ui.uploader && _m.ui.uploader.initDragAndDropUploader) {
				that._dndUploader = _m.ui.uploader.initDragAndDropUploader({
					container: _m.App.element,
					dropElement: $("#mollify-folderview"),
					handler: that._getUploadHandler()
				});
			}
			
			that._scrollOutThreshold = 100000;
			that._scrollInThreshold = 0;
			$(window).bind('scroll', that._updateScroll);
			
			$.each(_m.plugins.getFileViewPlugins(), function(i, p) {
				if (p.fileViewHandler.onActivate)
					p.fileViewHandler.onActivate(_m.App.element, h);
			});
			
			if (_m.filesystem.roots.length === 0) {
				that.showNoRoots();
				return;
			}
			
			var params = _m.request.getParams();
			if (params.path) {
				_m.filesystem.findFolder({path: params.path}, that.getDataRequest()).done(function(r) {
					var folder = r.folder;
					that.changeToFolder(folder);
				}).fail(function(e) {
					if (e.code == 203) {
						_m.ui.dialogs.error({ message: _m.ui.texts.get('mainviewFolderNotFound', params.path) });
						this.handled = true;
					}
					that.hideProgress();
					that.openInitialFolder();
				});
				return;
			}
						
			if (h.id) {
				that.changeToFolder(h.id.join("/")).fail(function() {
					this.handled = true;
					//TODO show error message that folder was not found?
					that.hideProgress();
					that.openInitialFolder();					
				});
			} else
				that.openInitialFolder();
		};
		
		this.onRestoreView = function(id) {
			that.changeToFolder(id.join("/"), true);
		};
		
		this._getUploadHandler = function(c) {
			return {
				isUploadAllowed: function(files) {
					if (!files) return false;
					var allowed = true;
					$.each(files, function(i, f) {
						var fn = files[i].name;
						if (!fn) return;
						
						var ext = fn.split('.').pop();
						if (!ext) return;
						
						ext = ext.toLowerCase();
						if (_m.session.data.filesystem.forbidden_file_upload_types.length > 0 && _m.session.data.filesystem.forbidden_file_upload_types.indexOf(ext) >= 0) allowed = false;

						if (_m.session.data.filesystem.allowed_file_upload_types.length > 0 && _m.session.data.filesystem.allowed_file_upload_types.indexOf(ext) < 0) allowed = false;
					});
					if (!allowed) {
						_m.ui.dialogs.notification({message:_m.ui.texts.get('mainviewFileUploadNotAllowed'), type: "warning"});
					}
					return allowed;
				},
				start: function(files, ready) {
					that.uploadProgress.show(_m.ui.texts.get(files.length > 1 ? "mainviewUploadProgressManyMessage" : "mainviewUploadProgressOneMessage", files.length), function() {
						ready();
					});
				},
				progress: function(pr, br) {
					var speed = "";
					if (br) speed = that._formatters.uploadSpeed.format(br/1024);
					that.uploadProgress.set(pr, speed);
				},
				finished: function() {
					if (c) c.close();
					that.uploadProgress.hide();
					_m.ui.dialogs.notification({message:_m.ui.texts.get('mainviewFileUploadComplete'), type: "success"});
					that.refresh();
				},
				failed: function() {
					if (c) c.close();
					that.uploadProgress.hide();
					_m.ui.dialogs.notification({message:_m.ui.texts.get('mainviewFileUploadFailed'), type: "error"});
				}
			};
		};
		
		this._updateScroll = function() {
			var s = $(window).scrollTop();			
			var $e = $("#mollify-folderview");
			
			var isDetached = $e.hasClass("detached");
			var toggle = (!isDetached && s > that._scrollOutThreshold) || (isDetached && s < that._scrollInThreshold);
			if (!toggle) return;
			
			if (!isDetached) $("#mollify-folderview").addClass("detached");
			else $("#mollify-folderview").removeClass("detached");
		};
		
		this.openInitialFolder = function() {
			if (_m.filesystem.roots.length === 0) that.showNoRoots();
			else if (_m.filesystem.roots.length == 1) that.changeToFolder(_m.filesystem.roots[0]);
			else that.changeToFolder(null);
		};
		
		this.onDeactivate = function() {
			$(window).unbind('scroll');
			
			if (that._dndUploader) that._dndUploader.destroy();
			
			$.each(_m.plugins.getFileViewPlugins(), function(i, p) {
				if (p.fileViewHandler.onDeactivate)
					p.fileViewHandler.onDeactivate();
			});
		};
		
		this.initViewTools = function($t) {
			_m.dom.template("mollify-tmpl-fileview-tools").appendTo($t);
			
			_m.ui.process($t, ["radio"], that);
			that.controls["mollify-fileview-style-options"].set(that._viewStyle);
			
			var onSearch = function() {
				var val = $("#mollify-fileview-search-input").val();
				if (!val || val.length === 0) return;
				$("#mollify-fileview-search-input").val("");
				that.changeToFolder({ type: "search", id: encodeURIComponent(val) });
			};
			$("#mollify-fileview-search-input").keyup(function(e){
				if (e.which == 13) onSearch();
			});
			$("#mollify-fileview-search > button").click(onSearch);
		};
				
		this.getDataRequest = function() {
			var rq = (!that._currentFolder || !that._currentFolder.type) ? {'core-parent-description': {}} : {};
			return $.extend(rq, that.itemWidget.getDataRequest ? that.itemWidget.getDataRequest() : {});
		};
		
		this.getCurrentFolder = function() {
			return that._currentFolder;
		};
		
		this.onEvent = function(e) {
			if (!e.type.startsWith('filesystem/')) return;
			//var files = e.payload.items;
			//TODO check if affects this view
			that.refresh();
		};
				
		this.onRadioChanged = function(groupId, valueId, i) {
			if (groupId == "mollify-fileview-style-options") that.onViewStyleChanged(valueId, i);
		};
		
		this.onViewStyleChanged = function(id, i) {
			that._viewStyle = i;
			that.initList();
			that.refresh();
		};
	
		this.showNoRoots = function() {
			//TODO show message, for admin instruct opening admin tool?
			that._currentFolder = false;
			that._currentFolderData = {items: _m.filesystem.roots};
			that._updateUI();
		};
			
		this.showProgress = function() {
			$("#mollify-folderview-items").addClass("loading");
		};
	
		this.hideProgress = function() {
			$("#mollify-folderview-items").removeClass("loading");
		};
	
		this.changeToFolder = function(f, noStore) {
			var id = f;
			if (!id) {
				if (_m.filesystem.roots)
					id = _m.filesystem.roots[0].id;
			} else if (typeof(id) != "string") id = that._getFolderPublicId(id);	
		
			if (!noStore) _m.App.storeView("files/"+ (id ? id : ""));
			
			if (that._currentFolder && that._currentFolder.type && that._customFolderTypes[that._currentFolder.type]) {
				if (that._customFolderTypes[that._currentFolder.type].onFolderDeselect)
					that._customFolderTypes[that._currentFolder.type].onFolderDeselect(that._currentFolder);
			}
			window.scrollTo(0, 0);
			that._selectedItems = [];
			that._currentFolder = false;
			that._currentFolderData = false;
			that.rootNav.setActive(false);

			if (!id) return $.Deferred().resolve();
			return that._onSelectFolder(id);
		};
		
		this._getFolderPublicId = function(f) {
			if (!f) return "";
			if (f.type && that._customFolderTypes[f.type])
				return f.type + "/" + f.id;
			return f.id;
		};
		
		this._onSelectFolder = function(id) {
			var onFail = function() {
				that.hideProgress();
			};
			_m.ui.hideActivePopup();
			that.showProgress();
			
			var idParts = id ? id.split("/") : [];
			if (idParts.length > 1 && that._customFolderTypes[idParts[0]]) {
				return that._customFolderTypes[idParts[0]].onSelectFolder(idParts[1]).done(that._setFolder).fail(onFail);
			} else if (!id || idParts.length == 1) {
				return _m.filesystem.folderInfo(id ? idParts[0] : null, true, that.getDataRequest()).done(function(r) {
					var folder = r.folder;
					var data = r;
					data.items = r.folders.slice(0).concat(r.files);
					
					that._setFolder(folder, data);
				}).fail(onFail);
			} else {
				// invalid id, just ignore
				that.hideProgress();
				return $.Deferred().reject();
			}
		};
		
		this.refresh = function() {
			if (!that._currentFolder) return;
			that._onSelectFolder(that._getFolderPublicId(that._currentFolder));
		};
		
		this._setFolder = function(folder, data) {
			that._currentFolder = folder;
			that._currentFolderData = data;
			
			that.hideProgress();
			that._updateUI();
		};
		
		this._canWrite = function() {
			return _m.filesystem.hasPermission(that._currentFolder, "filesystem_item_access", "rw");
		}
		
		this.onRetrieveUrl = function(url) {
			if (!that._currentFolder) return;
			
			that.showProgress();
			_m.service.post("filesystem/"+that._currentFolder.id+"/retrieve", {url:url}).done(function(r) {
				that.hideProgress();
				that.refresh();
			}).fail(function(error) {
				that.hideProgress();
				//301 resource not found
				if (error.code == 301) {
					this.handled = true;
					_m.ui.views.dialogs.error({
						message: _m.ui.texts.get('mainviewRetrieveFileResourceNotFound', [url])
					});
				}
			});
		};

		this.dropType = function(to, i) {
			var single = false;	
			if (!window.isArray(i)) single = i;
			else if (i.length === 0) single = i[0];
			
			var copy = (!single || to.root_id != single.root_id);
			return copy ? "copy" : "move";
		};
					
		this.canDragAndDrop = function(to, itm) {
			var single = false;	
			if (!window.isArray(itm)) single = itm;
			else if (itm.length === 0) single = itm[0];
			
			if (single)
				return that.dropType(to, single) == "copy" ? _m.filesystem.canCopyTo(single, to) : _m.filesystem.canMoveTo(single, to);
			
			var can = true;
			for(var i=0;i<itm.length; i++) {
				var item = itm[i];
				if (!(that.dropType(to, item) == "copy" ? _m.filesystem.canCopyTo(item, to) : _m.filesystem.canMoveTo(item, to))) {
					can = false;
					break;
				}
			}
			return can;
		};
		
		this.onDragAndDrop = function(to, itm) {
			var copy = (that.dropType(to, itm) == 'copy');
			//console.log((copy ? "copy " : "move ") +itm.name+" to "+to.name);
			
			if (copy) _m.filesystem.copy(itm, to);
			else _m.filesystem.move(itm, to);
		};
		
		this._updateUI = function() {
			var opt = {
				title: function() {
					return this.data.title ? this.data.title : _m.ui.texts.get(this.data['title-key']);
				}
			};
			var $h = $("#mollify-folderview-header-content").empty();
						
			if (that._currentFolder && that._currentFolder.type) {
				if (that._customFolderTypes[that._currentFolder.type]) {
					that._customFolderTypes[that._currentFolder.type].onRenderFolderView(that._currentFolder, that._currentFolderData, $h, $tb);
				}
			} else {
				var currentRoot = (that._currentFolderData && that._currentFolderData.hierarchy) ? that._currentFolderData.hierarchy[0] : false;
				that.rootNav.setActive(currentRoot);
				
				if (that._currentFolder)
					_m.dom.template("mollify-tmpl-fileview-header", {canWrite: that._canWrite(), folder: that._currentFolder}).appendTo($h);
				else
					_m.dom.template("mollify-tmpl-main-rootfolders").appendTo($h);

				var $tb = $("#mollify-fileview-folder-tools").empty();
				var $fa = $("#mollify-fileview-folder-actions");

				if (that._currentFolder) {
					if (that._canWrite()) {
						_m.dom.template("mollify-tmpl-fileview-foldertools-action", { icon: 'icon-folder-close' }, opt).appendTo($tb).click(function() {
							_m.ui.controls.dynamicBubble({element: $(this), content: _m.dom.template("mollify-tmpl-main-createfolder-bubble"), handler: {
								onRenderBubble: function(b) {
									var $i = $("#mollify-mainview-createfolder-name-input");
									var onCreate = function(){
										var name = $i.val();
										if (!name) return;

										b.hide();
										_m.filesystem.createFolder(that._currentFolder, name);
									};
									$("#mollify-mainview-createfolder-button").click(onCreate);
									$i.bind('keypress', function(e) {
										if ((e.keyCode || e.which) == 13) onCreate();
									}).focus();
								}
							}});
							return false;
						});
						if (_m.ui.uploader) _m.dom.template("mollify-tmpl-fileview-foldertools-action", { icon: 'icon-upload-alt' }, opt).appendTo($tb).click(function() {
							_m.ui.controls.dynamicBubble({element: $(this), content: _m.dom.template("mollify-tmpl-main-addfile-bubble"), handler: {
								onRenderBubble: function(b) {
									_m.ui.uploader.initUploadWidget($("#mollify-mainview-addfile-upload"), {
										url: _m.filesystem.getUploadUrl(that._currentFolder),
										handler: that._getUploadHandler(b)
									});
									
									if (!_m.features.hasFeature('retrieve_url')) {
										$("#mollify-mainview-addfile-retrieve").remove();
									}
									var onRetrieve = function() {
										var val = $("#mollify-mainview-addfile-retrieve-url-input").val();
										if (!val || val.length < 4 || val.substring(0,4).toLowerCase().localeCompare('http') !== 0) return false;
										b.close();
										that.onRetrieveUrl(val);
									};
									$("#mollify-mainview-addfile-retrieve-url-input").bind('keypress', function(e) {
										if ((e.keyCode || e.which) == 13) onRetrieve();
									});
									$("#mollify-mainview-addfile-retrieve-button").click(onRetrieve);
								}
							}});
							return false;
						});
					}
					
					// FOLDER
					var actionsElement = _m.dom.template("mollify-tmpl-fileview-foldertools-action", { icon: 'icon-cog', dropdown: true }, opt).appendTo($fa);
					_m.ui.controls.dropdown({
						element: actionsElement,
						items: false,
						hideDelay: 0,
						style: 'submenu',
						onShow: function(drp, items) {
							if (items) return;
						
							that.getItemActions(that._currentFolder, function(a) {
								if (!a) {
									drp.hide();
									return;
								}
								drp.items(a);
							});
						}
					});
				
					that.setupHierarchy(that._currentFolderData.hierarchy, $tb);
				
					that.showProgress();
				}

				if (that._dndUploader)
					that._dndUploader.setUrl(that._canWrite() ? _m.filesystem.getUploadUrl(that._currentFolder) : false);
				that.addCommonFileviewActions($fa);
			}
			
			_m.ui.process($h, ['localize']);

			that._scrollOutThreshold = $("#mollify-folderview-header").outerHeight() + 40;
			that._scrollInThreshold = that._scrollOutThreshold - 60;
			$("#mollify-folderview-detachholder").css("height", (that._scrollInThreshold + 40)+"px");
			$("#mollify-folderview").removeClass("detached");
			that.onResize();
			that._updateSelect();
			
			// show description
			var descriptionExists = that._currentFolderData.data && that._currentFolderData.data['core-parent-description'];
			if (descriptionExists)
				$("#mollify-folder-description").text(that._currentFolderData.data['core-parent-description']);
			
			var $dsc = $("#mollify-folder-description");
			var descriptionEditable = that._currentFolder && !that._currentFolder.type && $dsc.length > 0 && _m.session.features.descriptions && _m.filesystem.hasPermission(that._currentFolder, "edit_description");
			if (descriptionEditable) {
				_m.ui.controls.editableLabel({element: $dsc, hint: _m.ui.texts.get('mainviewDescriptionHint'), onedit: function(desc) {
					_m.service.put("filesystem/"+that._currentFolder.id+"/description/", {description: desc});
				}});
			} else {
				if (!descriptionExists) $dsc.hide();
			}
			
			// update file list
			that._updateList();
			
			that.hideProgress();
		};
		
		this.addCommonFileviewActions = function($c) {
			//TODO kaikki action-luonnit omaan luokkaan
			var opt = {
				title: function() {
					return this.data.title ? this.data.title : _m.ui.texts.get(this.data['title-key']);
				}
			};
			
			// SELECT
			that._selectModeBtn = _m.dom.template("mollify-tmpl-fileview-foldertools-action", { icon: 'icon-check', dropdown: true, style: "narrow", action: true }, opt).appendTo($c).click(that._onToggleSelect);
			_m.ui.controls.dropdown({
				element: that._selectModeBtn,
				items: false,
				hideDelay: 0,
				style: 'submenu',
				onShow: function(drp) {						
					that._getSelectionActions(function(a) {
						if (!a) {
							drp.hide();
							return;
						}
						drp.items(a);
					});
				}
			});
			
			// REFRESH					
			_m.dom.template("mollify-tmpl-fileview-foldertools-action", { icon: 'icon-refresh' }, opt).appendTo($c).click(that.refresh);	
		};
		
		this._getViewItems = function() {
			//if (that._currentFolder && that._currentFolder.type && that._customFolderTypes[that._currentFolder.type])
			//	return
			return that._currentFolderData.items;
		};
		
		this._getSelectionActions = function(cb) {
			var result = [];
			if (that._selectMode && that._selectedItems.length > 0) {
				var plugins = _m.plugins.getItemCollectionPlugins(that._selectedItems);		
				result = _m.helpers.getPluginActions(plugins);
				if (result.length > 0)
					result.unshift({"title" : "-"});
			}
			result.unshift({"title-key" : "mainViewFileViewSelectNone", callback: function() { that._updateSelect([]); } });
			result.unshift({"title-key" : "mainViewFileViewSelectAll", callback: function() { that._updateSelect(that._getViewItems()); } });
			cb(_m.helpers.cleanupActions(result));
		};
		
		this._onToggleSelect = function() {
			that._selectMode = !that._selectMode;
			that._updateSelect();
		};
		
		this._updateSelect = function(sel) {
			if (sel !== undefined) {
				that._selectedItems = sel;
				that._selectMode = true;
			}
			if (that._selectMode)
				that._selectModeBtn.addClass("active");
			else
				that._selectModeBtn.removeClass("active");
			that.itemWidget.setSelectMode(that._selectMode);
			if (that._selectMode) that.itemWidget.setSelection(that._selectedItems);
		};
		
		this._getRootItems = function() {
			var rootItems = [];
			var rootCb = function(r) {
				return function() { that.changeToFolder(r); };
			};
			for(var i=0,j=_m.filesystem.roots.length; i<j;i++) {
				var root = _m.filesystem.roots[i];
				rootItems.push({
					title: root.name,
					callback: rootCb(root)
				});
			}
			return rootItems;
		};
					
		this.setupHierarchy = function(h, $t) {
			var items = h;
			var p = $t.append(_m.dom.template("mollify-tmpl-fileview-folder-hierarchy", {items: items}));
			
			_m.ui.controls.dropdown({
				element: $("#mollify-folder-hierarchy-item-root"),
				items: that._getRootItems(),
				hideDelay: 0,
				style: 'submenu'
			});
			
			var $hi = $(".mollify-folder-hierarchy-item").click(function() {
				var folder = $(this).tmplItem().data;
				that.changeToFolder(folder);
			});
			
			if (_m.ui.draganddrop) {
				_m.ui.draganddrop.enableDrop($hi.find("a"), {
					canDrop : function($e, e, obj) {
						if (!obj || obj.type != 'filesystemitem') return false;
						var itm = obj.payload;
						var me = $e.parent().tmplItem().data;
						return that.canDragAndDrop(me, itm);
					},
					dropType : function($e, e, obj) {
						if (!obj || obj.type != 'filesystemitem') return false;
						var itm = obj.payload;
						var me = $e.tmplItem().data;
						return that.dropType(me, itm);
					},
					onDrop : function($e, e, obj) {
						if (!obj || obj.type != 'filesystemitem') return;
						var itm = obj.payload;
						var me = $e.parent().tmplItem().data;
						that.onDragAndDrop(me, itm);
					}
				});
			}
		};
		
		this.isListView = function() { return that._viewStyle === 0; };
		
		this._handleCustomAction = function(action, item, t) {
			if (!_m.settings["file-view"] || !_m.settings["file-view"].actions) return false;
			var actions = _m.settings["file-view"].actions;
			if (!actions[action] || (typeof(actions[action]) !== "function")) return false;
			
			var ctx = that._getCtxObj(item, t);
			var response = actions[action](item, ctx);
			if (!response) return false;

			if (typeof(response) == "string") {
				if (response == "open_popup") that.itemContext.open(ctx);
				else if (response == "open_menu") that.showActionMenu(item, ctx.element);
				else if (!item.is_file && response == "go_into_folder") that.changeToFolder(item);
			}
			return true;
		};
		
		this._getCtxObj = function(item, target) {
			return {
				item: item,
				viewtype: that.isListView() ? "list" : "icon",
				target: target,
				element: that.itemWidget.getItemContextElement(item),
				viewport: that.itemWidget.getContainerElement(),
				container: $("#mollify-folderview-items"),
				folder: that._currentFolder,
				folder_writable: that._currentFolder ? _m.filesystem.hasPermission(that._currentFolder, "filesystem_item_access", "rw") : false
			};	
		}
		
		this.initList = function() {
			var $h = $("#mollify-folderview-header-items").empty();
			if (that.isListView()) {
				var cols = _m.settings["file-view"]["list-view-columns"];
				that.itemWidget = new FileList(_m, 'mollify-folderview-items', $h, 'main', this._filelist, cols);
			} else {
				var thumbs = !!_m.session.features.thumbnails;
				that.itemWidget = new IconView(_m, 'mollify-folderview-items', $h, 'main', that._viewStyle == 1 ? 'iconview-small' : 'iconview-large', thumbs);
			}
			
			that.itemWidget.init({
				onFolderSelected : that.onFolderSelected,
				canDrop : that.canDragAndDrop,
				dropType : that.dropType,
				onDrop : that.onDragAndDrop,
				onClick: function(item, t, e) {
					if (that._handleCustomAction("onClick", item, t)) return;
					
					var ctx = that._getCtxObj(item, t);					
					if (that.isListView() && t != 'icon') {
						var col = that._filelist.columns[t];
						if (col["on-click"]) {
							col["on-click"](item, that._currentFolderData.data, ctx);
							return;
						}
					}
					var showContext = false;
					if (that.isListView()) {
						if (!item.is_file) {
							// folder click goes into the folder, icon opens context
							if (t=='name') that.changeToFolder(item);
							else if (t=='icon') showContext = true;
						} else {
							if (t=='name' || t=='icon') showContext = true;
						}
					} else {
						if (t=='info' || item.is_file) showContext = true;
						else that.changeToFolder(item); 
					}
					
					if (showContext) that.itemContext.open(ctx);
				},
				onDblClick: function(item) {
					if (that._handleCustomAction("onDblClick", item)) return;
					if (item.is_file) return;
					that.changeToFolder(item);
				},
				onRightClick: function(item, t, e) {
					if (that._handleCustomAction("onRightClick", item, t)) return;
					that.showActionMenu(item, that.itemWidget.getItemContextElement(item));
				},
				onContentRendered : function(items, data) {
					if (that._currentFolder && that._currentFolder.type && that._customFolderTypes[that._currentFolder.type]) {
						if (that._customFolderTypes[that._currentFolder.type].onItemListRendered)
							that._customFolderTypes[that._currentFolder.type].onItemListRendered(that._currentFolder, that._currentFolderData, items);
					}
				},
				getSelectedItems : function() {
					if (!that._selectMode || that._selectedItems.length === 0) return false;
					return that._selectedItems;
				},
				onSelectUnselect: function(item) {
					if (that._selectedItems.indexOf(item) >= 0) that._selectedItems.remove(item);
					else that._selectedItems.push(item);
					that.itemWidget.setSelection(that._selectedItems);
				}
			});
		};
		
		this._updateList = function() {
			that._items = that._currentFolderData.items;
			that._itemsById = _m.helpers.mapByKey(that._items, "id");
			if (that._selectedItems) {
				var existing = [];
				var ids = {};
				$.each(that._selectedItems, function(i, itm) {
					var newItem = that._itemsById[itm.id];
					if (!newItem || ids[itm.id]) return;
					existing.push(newItem);
					ids[itm.id] = true;
				});
				that._selectedItems = existing;
			}
			//$("#mollify-folderview-items").css("top", $("#mollify-folderview-header").outerHeight()+"px");
			that.itemWidget.content(that._items, that._currentFolderData.data);
			if (that._selectMode) that.itemWidget.setSelection(that._selectedItems);
		};
		
		this.showActionMenu = function(item, c) {
			c.addClass("open");
			var popup = _m.ui.controls.popupmenu({ element: c, onHide: function() {
				c.removeClass("open");
				that.itemWidget.removeHover();
			}});
			
			that.getItemActions(item, function(a) {
				if (!a) {
					popup.hide();
					return;
				}
				popup.items(a);
			});
		};
		
		this.getItemActions = function(item, cb) {
			_m.filesystem.itemDetails(item, _m.plugins.getItemContextRequestData(item)).done(function(d) {
				if (!d) {
					cb([]);
					return;
				}
				var ctx = {
					details: d,
					folder: that._currentFolder,
					folder_writable: that._currentFolder ? _m.filesystem.hasPermission(that._currentFolder, "filesystem_item_access", "rw") : false
				};
				cb(_m.helpers.cleanupActions(_m.helpers.getPluginActions(_m.plugins.getItemContextPlugins(item, ctx))));
			});
		};
	};
	
	var UploadProgress = function($e) {
		var t = this;
		this._h = $e.height();
		t._$title = $e.find(".title");
		t._$speed = $e.find(".speed");
		t._$bar = $e.find(".bar");
		
		return {
			show : function(title, cb) {
				$e.css("bottom", (0 - t._h)+"px");
				t._$title.text(title ? title : "");
				t._$speed.text("");
				t._$bar.css("width", "0%");
				$e.show().animate({"bottom": "0"}, 500, cb);
			},
			set : function(progress, speed) {
				t._$bar.css("width", progress+"%");
				t._$speed.text(speed ? speed : "");
			},
			hide : function(cb) {
				setTimeout(function() {
					$e.animate({"bottom": (0 - t._h) + "px"}, 500, function() {
						t._$bar.css("width", "0%");
						$e.hide();
						if (cb) cb();
					});
				}, 1000);
			}
		}
	};
	
	var IconView = function(_m, container, $headerContainer, id, cls, thumbs) {
		var t = this;
		t.$c = $("#"+container);
		t.viewId = 'mollify-iconview-'+id;
		
		this.init = function(p) {
			t.p = p;
			
			$headerContainer.append("<div class='mollify-iconview-header'></div>");
			
			_m.dom.template("mollify-tmpl-iconview", {viewId: t.viewId}).appendTo(t.$c.empty());
			t.$l = $("#"+t.viewId);
			if (cls) t.$l.addClass(cls);
		};
		
		this.content = function(items, data) {
			t.items = items;
			t.data = data;
			
			var supportedThumbs = ["jpg", "png", "gif", "jpeg"];	//TODO settings
			
			_m.dom.template("mollify-tmpl-iconview-item", items, {
				showThumb: function(item) {
					if (!thumbs || !item.is_file) return false;
					return (supportedThumbs.indexOf(item.extension) >= 0);
				},
				thumbUrl: function(item) {
					return _m.service.url("filesystem/"+item.id+"/thumbnail/");
				},
				typeClass : function(item) {
					var c = item.is_file ? 'item-file' : 'item-folder';
					if (item.is_file && item.extension) c += ' item-type-'+item.extension;
					else if (!item.is_file && item.id == item.root_id) c += ' item-root-folder';
					return c;
				}
			}).appendTo(t.$l.empty());
			
			var $items = t.$l.find(".mollify-iconview-item").hover(function() {
				$(this).addClass("hover");
			}, function() {
				$(this).removeClass("hover");
			}).bind("contextmenu",function(e){
				e.preventDefault();
				var $t = $(this);
				t.p.onRightClick($t.tmplItem().data, "", $t);
				return false;
			}).single_double_click(function(e) {
				var $t = $(this);
				var itm = $t.tmplItem().data;
				var $trg = $(e.target);
				if ($trg.hasClass("mollify-iconview-item-sel-option")) {
					t.p.onSelectUnselect(itm);
					return;
				}
				var col = "";
				if ($trg.parent().hasClass("mollify-iconview-item-info")) col = "info";

				t.p.onClick(itm, col, $t);
			},function() {
				t.p.onDblClick($(this).tmplItem().data);
			}).attr('unselectable', 'on').css({
				'-moz-user-select':'none',
				'-webkit-user-select':'none',
				'user-select':'none',
				'-ms-user-select':'none'
			});
			/*.draggable({
				revert: "invalid",
				distance: 10,
				addClasses: false,
				zIndex: 2700
			}).droppable({
				hoverClass: "drophover",
				accept: function(i) { return t.p.canDrop ? t.p.canDrop($(this).tmplItem().data, $(i).tmplItem().data) : false; }
			})*/
			
			if (_m.ui.draganddrop) {
				_m.ui.draganddrop.enableDrag($items, {
					onDragStart : function($e, e) {
						var item = $e.tmplItem().data;
						var sel = t.p.getSelectedItems();
						if (!sel) sel = item;
						else if (sel.indexOf(item) < 0) sel.push(item);
						return {type:'filesystemitem', payload: sel};
					}
				});
				_m.ui.draganddrop.enableDrop(t.$l.find(".mollify-iconview-item.item-folder"), {
					canDrop : function($e, e, obj) {
						if (!t.p.canDrop || !obj || obj.type != 'filesystemitem') return false;
						var i = obj.payload;
						var me = $e.tmplItem().data;
						return t.p.canDrop(me, i);
					},
					dropType : function($e, e, obj) {
						if (!t.p.dropType || !obj || obj.type != 'filesystemitem') return false;
						var i = obj.payload;
						var me = $e.tmplItem().data;
						return t.p.dropType(me, i);
					},
					onDrop : function($e, e, obj) {
						if (!obj || obj.type != 'filesystemitem') return;
						var i = obj.payload;
						var me = $e.tmplItem().data;
						if (t.p.onDrop) t.p.onDrop(me, i);
					}
				});
			}
			
			t.p.onContentRendered(items, data);
		};
		
		/*this.getItemContextElement = function(item) {
			return t.$l.find("#mollify-iconview-item-"+item.id);
		};*/
		
		this.getItemContextElement = function(item) {
			return t.$l.find("#mollify-iconview-item-"+item.id);
		};
		
		this.getContainerElement = function() {
			return t.$l;	
		};
		
		this.removeHover = function() {
			t.$l.find(".mollify-iconview-item.hover").removeClass('hover');
		};
		
		this.setSelectMode = function(sm) {
			t.$l.find(".mollify-iconview-item.selected").removeClass("selected");
			if (sm) {
				t.$l.addClass("select");
			} else {
				t.$l.removeClass("select");
			}
		};
		
		this.setSelection = function(items) {
			t.$l.find(".mollify-iconview-item.selected").removeClass("selected");
			$.each(items, function(i, itm) {
				t.$l.find("#mollify-iconview-item-"+itm.id).addClass("selected");
			});
		};
	};
		
	var FileList = function(_m, container, $headerContainer, id, filelistSpec, columns) {
		var t = this;
		t.minColWidth = 25;
		t.$c = $("#"+container);
		t.$hc = $headerContainer;
		t.listId = 'mollify-filelist-'+id;
		t.cols = [];
		t.sortCol = false;
		t.sortOrderAsc = true;
		t.colWidths = {};
		
		for (var colId in columns) {
			var col = filelistSpec.columns[colId];
			if (!col) continue;
			
			var colSpec = $.extend({}, col, columns[colId]);
			t.cols.push(colSpec);
		}
		
		this.init = function(p) {
			t.p = p;
			_m.dom.template("mollify-tmpl-filelist-header", {listId: t.listId}).appendTo(t.$hc.empty());
			_m.dom.template("mollify-tmpl-filelist", {listId: t.listId}).appendTo(t.$c.empty());
			t.$l = $("#"+t.listId);
			t.$h = $("#"+t.listId+"-header-cols");
			t.$i = $("#"+t.listId+"-items");
			
			_m.dom.template("mollify-tmpl-filelist-headercol", t.cols, {
				title: function(c) {
					var k = c['title-key'];
					if (!k) return "";
					
					return _m.ui.texts.get(k);
				} 
			}).appendTo(t.$h);
			
			t.$h.find(".mollify-filelist-col-header").each(function(i) {
				var $t = $(this);
				var ind = $t.index();
				if (ind <= 1) return;
				var col = t.cols[ind-2];
				
				var minColWidth = col["min-width"] || t.minColWidth;
				
				$t.css("min-width", minColWidth);
				if (col.width) $t.css("width", col.width);
				
				$t.find(".mollify-filelist-col-header-title").click(function() {
					t.onSortClick(col);
				});
				
				if (i != (t.cols.length-1)) {
					$t.resizable({
						handles: "e",
						minWidth: minColWidth,
						//autoHide: true,
						start: function(e, ui) {
							//TODO max?
							var max = t.$c.width() - (t.cols.length * t.minColWidth);
							$t.resizable("option", "maxWidth", max);
						},
						stop: function(e, ui) {
							var w = $t.width();
							t.colWidths[col.id] = w;
							t.updateColWidth(col.id, w);
						}
					});/*.draggable({
						axis: "x",
						helper: "clone",
						revert: "invalid",
						distance: 30
					});*/
				}
				if (col["on-init"]) col["on-init"](t);
			});
			t.items = [];
			t.data = {};
			t.onSortClick(t.cols[0]);
		};
	
		this.updateColWidths = function() {
			for (var colId in t.colWidths) t.updateColWidth(colId, t.colWidths[colId]);
		};
			
		this.updateColWidth = function(id, w) {
			$(".mollify-filelist-col-"+id).width(w);
		};
		
		this.onSortClick = function(col) {
			if (col.id != t.sortCol.id) {
				t.sortCol = col;
				t.sortOrderAsc = true;
			} else {
				t.sortOrderAsc = !t.sortOrderAsc;
			}
			t.refreshSortIndicator();
			t.content(t.items, t.data);
		};
		
		this.sortItems = function() {
			var s = t.sortCol.sort;
			t.items.sort(function(a, b) {
				return s(a, b, t.sortOrderAsc ? 1 : -1, t.data);
			});
		};
		
		this.refreshSortIndicator = function() {
			t.$h.find(".mollify-filelist-col-header").removeClass("sort-asc").removeClass("sort-desc");
			$("#mollify-filelist-col-header-"+t.sortCol.id).addClass("sort-" + (t.sortOrderAsc ? "asc" : "desc"));
		};
		
		this.getDataRequest = function() {
			var rq = {};
			for (var i=0, j=t.cols.length; i<j; i++) {
				var c = t.cols[i];
				if (c['request-id']) rq[c['request-id']] = {};
			}
			return rq;
		};
		
		this.content = function(items, data) {
			t.items = items;
			t.data = data;
			t.sortItems();
			
			_m.dom.template("mollify-tmpl-filelist-item", items, {
				cols: t.cols,
				typeClass : function(item) {
					var c = item.is_file ? 'item-file' : 'item-folder';
					if (item.is_file && item.extension) c += ' item-type-'+item.extension;
					else if (!item.is_file && item.id == item.root_id) c += ' item-root-folder';
					return c;
				},
				col: function(item, col) {
					return col.content(item, t.data);
				},
				itemColStyle: function(item, col) {
					var style="min-width:"+(col["min-width"] || t.minColWidth)+"px";
					if (col.width) style = style+";width:"+col.width+"px";
					return style;
				}
			}).appendTo(t.$i.empty());
			
			for (var i=0,j=t.cols.length; i<j; i++) {
				var col = t.cols[i];
				if (col["on-render"]) col["on-render"](t);
			}
			
			var $items = t.$i.find(".mollify-filelist-item");
			$items.hover(function() {
				$(this).addClass("hover");
			}, function() {
				$(this).removeClass("hover");
			}).bind("contextmenu",function(e){
				e.preventDefault();
				t.onItemClick($(this), $(e.toElement || e.target), false);
				return false;
			}).single_double_click(function(e) {
				e.preventDefault();
				e.stopPropagation();
				t.onItemClick($(this), $(e.toElement || e.target), true);
				return false;
			},function() {
				t.p.onDblClick($(this).tmplItem().data);
			});
			
			if (_m.ui.draganddrop) {
				_m.ui.draganddrop.enableDrag($items, {
					onDragStart : function($e, e) {
						var item = $e.tmplItem().data;
						var sel = t.p.getSelectedItems();
						if (!sel) sel = item;
						else if (sel.indexOf(item) < 0) sel.push(item);
						return {type:'filesystemitem', payload: sel};
					}
				});
				_m.ui.draganddrop.enableDrop(t.$i.find(".mollify-filelist-item.item-folder"), {
					canDrop : function($e, e, obj) {
						if (!t.p.canDrop || !obj || obj.type != 'filesystemitem') return false;
						var i = obj.payload;
						var me = $e.tmplItem().data;
						return t.p.canDrop(me, i);
					},
					dropType : function($e, e, obj) {
						if (!t.p.dropType || !obj || obj.type != 'filesystemitem') return false;
						var i = obj.payload;
						var me = $e.tmplItem().data;
						return t.p.dropType(me, i);
					},
					onDrop : function($e, e, obj) {
						if (!obj || obj.type != 'filesystemitem') return;
						var i = obj.payload;
						var me = $e.tmplItem().data;
						if (t.p.onDrop) t.p.onDrop(me, i);
					}
				});
			}
			
			/*.click(function(e) {
				e.preventDefault();
				t.onItemClick($(this), $(e.srcElement), true);
				return false;
			})*/
	
			/*t.$i.find(".mollify-filelist-quickmenu").click(function(e) {
				e.preventDefault();
				var $t = $(this);
				t.p.onMenuOpen($t.tmplItem().data, $t);
			});*/
	
			/*t.$i.find(".mollify-filelist-item-name-title").click(function(e) {
				e.preventDefault();
				t.p.onClick($(this).tmplItem().data, "name");
			});*/
			/*t.$i.find(".item-folder .mollify-filelist-item-name-title").click(function(e) {
				e.preventDefault();
				t.p.onFolderSelected($(this).tmplItem().data);
			});*/
			
			t.updateColWidths();
			
			t.p.onContentRendered(items, data);
		};
		
		this.onItemClick = function($item, $el, left) {
			var i = $item.find(".mollify-filelist-col").index($el.closest(".mollify-filelist-col"));
			if (i<0) return;
			var itm = $item.tmplItem().data;
			if (i === 0) {
				t.p.onSelectUnselect(itm);
				return;
			}
			var colId = (i === 1 ? "icon" : t.cols[i-2].id);
			if (left)
				t.p.onClick(itm, colId, $item);
			else
				t.p.onRightClick(itm, colId, $item);
		};
			
		this.getItemContextElement = function(item) {
			var $i = t.$i.find("#mollify-filelist-item-"+item.id);
			return $i.find(".mollify-filelist-col-name") || $i; 
		};
		
		this.getItemForElement = function($el) {
			return $el.tmplItem().data;
		};
		
		this.getContainerElement = function() {
			return t.$i;	
		};
		
		this.removeHover = function() {
			t.$i.find(".mollify-filelist-item.hover").removeClass('hover');
		};
		
		this.setSelectMode = function(sm) {
			t.$i.find(".mollify-filelist-item.selected").removeClass("selected");
			if (sm) {
				t.$l.addClass("select");
				t.$h.addClass("select");
			} else {
				t.$l.removeClass("select");
				t.$h.removeClass("select");				
			}
		};
		
		this.setSelection = function(items) {
			t.$i.find(".mollify-filelist-item.selected").removeClass("selected");
			$.each(items, function(i, itm) {
				t.$i.find("#mollify-filelist-item-"+itm.id).addClass("selected");
			});
		};
	};
}(window.jQuery, window.mollify);