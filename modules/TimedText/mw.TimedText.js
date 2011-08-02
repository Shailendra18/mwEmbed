/**
 * The Core timed Text interface object
 *
 * handles class mappings for:
 * 	menu display ( jquery.ui themeable )
 * 	timed text loading request
 *  timed text edit requests
 * 	timed text search & seek interface ( version 2 )
 *
 * @author: Michael Dale
 *
 */
mw.includeAllModuleMessages();

( function( mw, $ ) {

	// Merge in timed text related attributes:
	mw.mergeConfig( 'EmbedPlayer.SourceAttributes', [
  	   'srclang',
  	   'kind',
	   'label'
	]);
	
	/**
	 * Timed Text Object
	 * @param embedPlayer Host player for timedText interfaces
	 */
	mw.TimedText = function( embedPlayer, options ) {
		return this.init( embedPlayer, options);
	};
	
	mw.TimedText.prototype = {

		/**
		* Preferences config order is presently:
		* 1) user cookie
		* 2) defaults provided in this config var:
		*/
		config: {
			// Layout for basic "timedText" type can be 'ontop', 'off', 'below'
			'layout' : 'ontop',

			//Set the default local ( should be grabbed from the browser )
			'userLanugage' : 'en',

			//Set the default kind of timedText to display ( un-categorized timed-text is by default "subtitles" )
			'userKind' : 'subtitles'
		},

		/**
		 * The list of enabled sources
		 */
		enabledSources: [],

		/**
		 * The current language key
		 */
		currentLangKey : null,

		/**
		 * Stores the last text string per kind to avoid dom checks
		 * for updated text
		 */
		prevText: [],

		/**
		* Text sources ( a set of textSource objects )
		*/
		textSources: null,

		/**
		* Valid "Track" categories
		*/
		validCategoriesKeys: [
			"CC",
			"SUB",
			"TAD",
			"KTV",
			"TIK",
			"AR",
			"NB",
			"META",
			"TRX",
			"LRC",
			"LIN",
			"CUE"
		],

		/**
		 * @constructor
		 * @param {Object} embedPlayer Host player for timedText interfaces
		 */
		init: function( embedPlayer, options ) {
			var _this = this;
			mw.log("TimedText: init() ");
			this.embedPlayer = embedPlayer;
			this.options = options;
			
			// Load user preferences config:
			var preferenceConfig = $.cookie( 'TimedText.Preferences' );
			if( preferenceConfig !== "false" && preferenceConfig != null ) {
				this.config = JSON.parse(  preferenceConfig );
			}
			
			this.addPlayerBindings();
		},
		
		/**
		 * Add timed text related player bindings
		 * @return
		 */
		addPlayerBindings: function(){
			var _this = this;
			var embedPlayer = this.embedPlayer;
			
			// Check for timed text support:
			$( embedPlayer ).bind( 'addControlBarComponent', function(event, controlBar ){
				if( embedPlayer.hasTextTracks() ){
					controlBar.supportedComponets['timedText'] = true;
					controlBar.components['timedText'] = _this.getTimedTextButton();					
				}
			});
			
			$( embedPlayer ).bind( 'monitorEvent', function() {
				_this.monitor();
			} );

			$( embedPlayer ).bind( 'onplay', function() {
				// Will load and setup timedText sources (if not loaded already loaded )
				_this.setupTextSources();
				// hide the caption menu if presently displayed
				$( '#textMenuContainer_' + embedPlayer.id ).parent().remove();
			} );
			
			// Resize the timed text font size per window width
			$( embedPlayer ).bind( 'onCloseFullScreen onOpenFullScreen', function() {
				var textOffset = _this.embedPlayer.controlBuilder.fullscreenMode ? 30 : 10;
				
				mw.log( 'TimedText::set text size for: : ' + embedPlayer.$interface.width() + ' = ' + _this.getInterfaceSizeTextCss({
					'width' :  embedPlayer.$interface.width(),
					'height' : embedPlayer.$interface.height()
				})['font-size'] );
				
				embedPlayer.$interface.find( '.track' ).css( _this.getInterfaceSizeTextCss({
					'width' :  embedPlayer.$interface.width(),
					'height' : embedPlayer.$interface.height()
				}) ).css({
					// Get the text size scale then set it to control bar height + 10 px; 
					'bottom': ( _this.embedPlayer.controlBuilder.getHeight() + textOffset ) + 'px'
				});
				
			});
			
			// Update the timed text size
			$( embedPlayer ).bind( 'onResizePlayer', function(e, size, animate) {
				mw.log( 'TimedText::onResizePlayer: ' + _this.getInterfaceSizeTextCss(size)['font-size'] );
				if (animate) {
					embedPlayer.$interface.find( '.track' ).animate( _this.getInterfaceSizeTextCss( size ) );
				} else {
					embedPlayer.$interface.find( '.track' ).css( _this.getInterfaceSizeTextCss( size ) );
				}
			});

			// Setup display binding
			$( embedPlayer ).bind( 'onShowControlBar', function(event, layout ){
				// Move the text track if present
				embedPlayer.$interface.find( '.track' )
				.stop()
				.animate( layout, 'fast' );
			});
			
			$( embedPlayer ).bind( 'onHideControlBar', function(event, layout ){
				// Move the text track down if present
				embedPlayer.$interface.find( '.track' )
				.stop()
				.animate( layout, 'fast' );
			});
			
		},
		
		/**
		 * Get the current language key
		 * 
		 * @return 
		 * @type {string}
		 */
		getCurrentLangKey: function(){
			return this.currentLangKey;
		},
		
		/**
		 * The timed text button to be added to the interface
		 */
		getTimedTextButton: function(){
			var _this = this;
			/**
			* The closed captions button
			*/
			return {
				'w': 28,
				'o': function( ctrlObj ) {
					var $textButton = $( '<div />' )
						.attr( 'title', gM( 'mwe-embedplayer-timed_text' ) )
						.addClass( "ui-state-default ui-corner-all ui-icon_link rButton timed-text" )
						.append(
							$( '<span />' )
							.addClass( "ui-icon ui-icon-comment" )
						)
						// Captions binding:
						.buttonHover();
					_this.bindTextButton( $textButton );
					return $textButton;
						
				}
			};
		},
		
		bindTextButton: function($textButton){
			var _this = this;
			$textButton.unbind('click.textMenu').bind('click.textMenu', function() {
				_this.showTextMenu();
			} );
		},
		
		/**
		* Get the fullscreen text css
		*/
		getInterfaceSizeTextCss: function( size ) {			
			//mw.log(' win size is: ' + $( window ).width() + ' ts: ' + textSize );
			return {
				'font-size' : this.getInterfaceSizePercent( size ) + '%'
			};
		},
		
		/**
		* Show the text interface library and show the text interface near the player.
		*/
		showTextMenu: function() {
			var embedPlayer = this.embedPlayer;
			var loc = embedPlayer.$interface.find( '.rButton.timed-text' ).offset();
			mw.log('showTextInterface::' + embedPlayer.id + ' t' + loc.top + ' r' + loc.right);

			var $menu = $( '#timedTextMenu_' + embedPlayer.id );
			if ( $menu.length != 0 ) {
				// Hide show the menu:
				if( $menu.is( ':visible' ) ) {
					$menu.hide( "fast" );
				}else{
					// move the menu to proper location
					$menu.show("fast");
				}
			}else{				
				// Bind the text menu:
				this.bindMenu( true );
			}
		},
		getTextMenuContainer: function(){
			var textMenuId = 'textMenuContainer_' + this.embedPlayer.id;
			if( !$( '#' + textMenuId ).length ){
				//Setup the menu:
				$('body').append(
					$('<div>')
						.addClass('ui-widget ui-widget-content ui-corner-all')
						.attr( 'id', textMenuId )
						.css( {
							'position' 	: 'absolute',
							'z-index' 	: 10,
							'height'	: '180px',
							'width' 	: '180px',
							'font-size'	: '12px',
							'display' : 'none'
						} )
	
				);
			}
			return $( '#' + textMenuId );
		},
		getInterfaceSizePercent: function( size ) {
			// Some arbitrary scale relative to window size ( 400px wide is text size 105% )
			var textSize = size.width / 5.2;
			if( textSize < 95 ) textSize = 95;
			if( textSize > 200 ) textSize = 200;
			return textSize;
		},

		/**
		* Setups available text sources
		*   loads text sources
		* 	auto-selects a source based on the user language
		* @param {Function} callback Function to be called once text sources are setup.
		*/
		setupTextSources: function( callback ) {
			mw.log( 'mw.TimedText::setupTextSources');
			var _this = this;
			// Load textSources
			_this.loadTextSources( function() {
				// Enable a default source and issue a request to "load it"
				_this.autoSelectSource();

				// Load and parse the text value of enabled text sources:
				_this.loadEnabledSources();

				if( callback ) {
					callback();
				}
			} );
		},

		/**
		* Binds the timed text menu
		* and updates its content from "getMainMenu"
		*
		* @param {Object} target to display the menu
		* @param {Boolean} autoShow If the menu should be displayed
		*/
		bindMenu: function( autoShow) {
			var _this = this;
			var $menuButton = this.embedPlayer.$interface.find( '.timed-text' );

			var positionOpts = { };
			if( this.embedPlayer.supports[ 'overlays' ] ){
				var positionOpts = {
					'directionV' : 'up',
					'offsetY' : this.embedPlayer.controlBuilder.getHeight(),
					'directionH' : 'left',
					'offsetX' : -28
				};
			}

			// Else bind and show the menu
			// We already have a loader in embedPlayer so the delay of
			// setupTextSources is already taken into account
			_this.setupTextSources( function() {
				// NOTE: Button target should be an option or config
				$menuButton.unbind().menu( {
					'content'	: _this.getMainMenu(),
					'zindex' : mw.getConfig( 'EmbedPlayer.FullScreenZIndex' ) + 2,
					'crumbDefaultText' : ' ',
					'autoShow': autoShow,
					'targetMenuContainer' : _this.getTextMenuContainer(),
					'positionOpts' : positionOpts,
					'backLinkText' : gM( 'mwe-timedtext-back-btn' ),
					'createMenuCallback' : function(){
						_this.embedPlayer.controlBuilder.showControlBar( true );
					},
					'closeMenuCallback' : function(){
						_this.embedPlayer.controlBuilder.keepControlBarOnScreen = false;
					}
				} );
			});
		},

		/**
		* Monitor video time and update timed text filed[s]
		*/
		monitor: function( ) {
			//mw.log(" timed Text monitor: " + this.enabledSources.length );
			var embedPlayer = this.embedPlayer;
			// Setup local reference to currentTime:
			var currentTime = embedPlayer.currentTime;

			// Get the text per kind
			var textCategories = [ ];

			for( var i = 0; i < this.enabledSources.length ; i++ ) {
				var source = this.enabledSources[ i ];
				this.updateSourceDisplay( source, currentTime );
			}
		},

		/**
		 * Load all the available text sources from the inline embed
		 * @param {Function} callback Function to call once text sources are loaded
		 */
		loadTextSources: function( callback ) {
			var _this = this;
			// check if text sources are already loaded ( not null )
			if( this.textSources !== null ){
				callback( this.textSources );
				return ;
			}
			this.textSources = [];
			// load inline text sources:
			$.each( this.embedPlayer.getTextTracks(), function( inx, textSource ){
				_this.textSources.push( new mw.TextSource( textSource ) );
			});
			// return the callback with sources
			callback( _this.textSources );
		},

		/**
		* Get the layout mode
		*
		* Takes into consideration:
		* 	Playback method overlays support ( have to put subtitles bellow video )
		*
		*/
		getLayoutMode: function() {
		 	// Re-map "ontop" to "below" if player does not support
		 	if( this.config.layout == 'ontop' && !this.embedPlayer.supports['overlays'] ) {
		 		this.config.layout = 'below';
		 	}
		 	return this.config.layout;
		},

		/**
		* Auto selects a source given the local configuration
		*
		* NOTE: presently this selects a "single" source.
		* In the future we could support multiple "enabled sources"
		*/
		autoSelectSource: function() {
			var _this = this;
			this.enabledSources = [];
			// Check if any source matches our "local"
			$.each( this.textSources, function(inx, source){
				if(	_this.config.userLanugage == source.srclang.toLowerCase() 
					&& 
					_this.config.userKind == source.kind
				) {
					// Check for kind if available
					_this.enableSource( source );
					return ;
				}
			});
			// If no userLang, source try enabling English:
			if( this.enabledSources.length == 0 ) {
				for( var i=0; i < this.textSources.length; i++ ) {
					var source = this.textSources[ i ];
					if( source.srclang.toLowerCase() == 'en' ) {
						this.enableSource( source );
						return ;
					}
				}
			}
			// If still no source try the first source we get;
			if( this.enabledSources.length == 0 ) {
				for( var i=0; i < this.textSources.length; i++ ) {
					var source = this.textSources[ i ];
					this.enableSource( source );
					return ;
				}
			}
		},
		/**
		 * Enable a source and update the currentLangKey 
		 * @param source
		 * @return
		 */
		enableSource: function( source ){
			this.enabledSources.push( source );
			this.currentLangKey = source.srclang;
		},

		// Get the current source sub captions
		loadCurrentSubSrouce: function( callback ){
			mw.log("loadCurrentSubSrouce:: enabled source:" + this.enabledSources.length);
			for( var i =0; i < this.enabledSources.length; i++ ){
				var source = this.enabledSources[i];
				if( source.kind == 'SUB' ){
					source.load( function(){
						callback( source);
						return ;
					});
				}
			}
			return false;
		},

		// Get sub captions by language key:
		getSubCaptions: function( langKey, callback ){
			for( var i=0; i < this.textSources.length; i++ ) {
				var source = this.textSources[ i ];
				if( source.srclang.toLowerCase() == langKey ) {
					var source = this.textSources[ i ];
					source.load( function(){
						callback( source.captions );
					});
				}
			}
		},

		/**
		* Issue a request to load all enabled Sources
		*  Should be called anytime enabled Source list is updated
		*/
		loadEnabledSources: function() {
			$.each( this.enabledSources, function( inx, enabledSource ) {
				enabledSource.load();
			});
		},

		/**
		* Selection of a menu item
		*
		* @param {Element} item Item selected
		*/
		selectMenuItem: function( item ) {
			mw.log("selectMenuItem: " + $( item ).find('a').attr('class') );
		},

		/**
		* Checks if a source is "on"
		* @return {Boolean}
		* 	true if source is on
		* 	false if source is off
		*/
		isSourceEnabled: function( source ) {
			$.each( this.enabledSources, function( inx, enabledSource ) {
				if( source.id ) {
					if( source.id == enabledSource.id )
						return true;
				}
				if( source.srclang ) {
					if( source.srclang == enabledSource.srclang )
						return true;
				}
			});
			return false;
		},

		/**
		* Get a source object by language, returns "false" if not found
		*/
		getSourceByLanguage: function ( langKey ) {
			for(var i=0; i < this.textSources.length; i++) {
				var source = this.textSources[ i ];
				if( source.srclang == langKey )
					return source;
			}
			return false;
		},

		/**
		* Builds the core timed Text menu and
		* returns the binded jquery object / dom set
		*
		* Assumes text sources have been setup: ( _this.setupTextSources() )
		*
		* calls a few sub-functions:
		* Basic menu layout:
		*		Chose Language
		*			All Subtiles here ( if we have categories list them )
		*		Layout
		*			Bellow video
		*			Ontop video ( only available to supported plugins )
		* TODO features:
		*		[ Search Text ]
		*			[ This video ]
		*			[ All videos ]
		*		[ Chapters ] seek to chapter
		*/
		getMainMenu: function() {
			var _this = this;
			
			// Build the source list menu item:
			var $menu = $( '<ul>' );
			
			// Show text menu item with layout option (if not fullscren ) 
			if( _this.textSources.length != 0 ) {
				$menu.append(
					$.getLineItem( gM( 'mwe-timedtext-choose-text'), 'comment' ).append(
						_this.getLanguageMenu()
					)					
				);
			} 
			
			// Layout Menu option if not in an iframe and we can expand video size: 

			$menu.append(
				$.getLineItem( gM( 'mwe-timedtext-layout' ), 'image' ).append(
					_this.getLayoutMenu()
				)
			);
			
			if(  _this.textSources.length == 0 ){
				// Add a link to request timed text for this clip:
				if( mw.getConfig( 'TimedText.ShowRequestTranscript' ) ){
					$menu.append(
						$.getLineItem( gM( 'mwe-timedtext-request-subs'), 'comment', function(){
							_this.getAddSubRequest();
						})
					);
				} else {
					$menu.append(
						$.getLineItem( gM( 'mwe-timedtext-no-subs'), 'close' )
					);
				}
			}

			// Put in the "Make Transcript" link if config enabled and we have an api key
			if( mw.getConfig( 'TimedText.ShowAddTextLink' ) && _this.embedPlayer.apiTitleKey ){
				$menu.append(
					_this.getLiAddText()
				);
			}

			// Allow other modules to add to the timed text menu:
			$( _this.embedPlayer ).trigger( 'TimedText.BuildCCMenu', $menu ) ;

			// Test if only one menu item move its children to the top level
			if( $menu.children('li').length == 1 ){
				$menu.find('li > ul > li').detach().appendTo( $menu );  
				$menu.find('li').eq(0).remove();
			}
			
			return $menu;
		},

		/**
		* Utility function to assist in menu build out:
		* Get menu line item (li) html: <li><a> msgKey </a></li>
		*
		* @param {String} msgKey Msg key for menu item
		*/

		/**
		 * Get the add text menu item:
		 */
		getLiAddText: function() {
			var _this = this;
			return $.getLineItem( gM( 'mwe-timedtext-upload-timed-text'), 'script', function() {
				_this.showTimedTextEditUI( 'add' );
			});
		},

		/**
		* Get line item (li) from source object
		* @param {Object} source Source to get menu line item from
		*/
		getLiSource: function( source ) {
			var _this = this;
			//See if the source is currently "on"
			var source_icon = ( this.isSourceEnabled( source ) )? 'bullet' : 'radio-on';

			if( source.title ) {
				return $.getLineItem( source.title, source_icon, function() {
					_this.selectTextSource( source );
				});
			}	
			if( source.srclang ) {
				var langKey = source.srclang.toLowerCase();
				return $.getLineItem(
					gM('mwe-timedtext-key-language', langKey, _this.getLanguageName ( langKey ) ),
					source_icon,
					function() {
						_this.selectTextSource( source );
					}
				);
			}
		},

		/**
	 	 * Get language name from language key
	 	 * @param {String} lang_key Language key
	 	 */
	 	getLanguageName: function( lang_key ) {
	 		if( mw.Language.names[ lang_key ]) {
	 			return mw.Language.names[ lang_key ];
	 		}
	 		return false;
	 	},

		/**
		* Builds and returns the "layout" menu
		* @return {Object}
		* 	The jquery menu dom object
		*/
		getLayoutMenu: function() {
			var _this = this;
			var layoutOptions = [ ];

			//Only display the "ontop" option if the player supports it:
			if( this.embedPlayer.supports[ 'overlays' ] )
				layoutOptions.push( 'ontop' );

			//Add below and "off" options:
			if( ! mw.getConfig('EmbedPlayer.IsIframeServer') ){
				layoutOptions.push( 'below' );
			}
			layoutOptions.push( 'off' );

			$ul = $('<ul>');
			$.each( layoutOptions, function( na, layoutMode ) {
				var icon = ( _this.config.layout == layoutMode ) ? 'bullet' : 'radio-on';
				$ul.append(
					$.getLineItem(
						gM( 'mwe-timedtext-layout-' + layoutMode),
						icon,
						function() {
							_this.selectLayout( layoutMode );
						} )
					);
			});
			return $ul;
		},

		/**
		* Select a new layout
		* @param {Object} layoutMode The selected layout mode
		*/
		selectLayout: function( layoutMode ) {
			var _this = this;
			if( layoutMode != _this.config.layout ) {
				// Update the config and redraw layout
				_this.config.layout = layoutMode;						
				
				// Update the display:
				_this.updateLayout();
			}
		},

		/**
		* Updates the timed text layout ( should be called when config.layout changes )
		*/
		updateLayout: function() {
			var $playerTarget = this.embedPlayer.$interface;
			$playerTarget.find('.track').remove();
			this.refreshDisplay();
		},

		/**
		* Select a new source
		*
		* @param {Object} source Source object selected
		*/
		selectTextSource: function( source ) {
			var _this = this;
			mw.log("mw.TimedText:: selectTextSource: select lang: " + source.srclang );
			
			// For some reason we lose binding for the menu ~sometimes~ re-bind
			this.bindTextButton( this.embedPlayer.$interface.find('timed-text') );
			
			this.currentLangKey =  source.srclang;
			
			// Update the config language if the source includes language
			if( source.srclang )
				this.config.userLanugage = source.srclang;

			if( source.kind )
				this.config.userKind = source.kind;

			// (@@todo update kind & setup kind language buckets? )

			// Remove any other sources selected in sources kind
			this.enabledSources = [];

			this.enabledSources.push( source );
			
			// Set any existing text target to "loading"
			if( !source.loaded ) {
				var $playerTarget = this.embedPlayer.$interface;
				$playerTarget.find('.track').text( gM('mwe-timedtext-loading-text') );
				// Load the text:
				source.load( function() {
					// Refresh the interface:
					_this.refreshDisplay();
				});
			} else {
				_this.refreshDisplay();
			}
		},

		/**
		* Refresh the display, updates the timedText layout, menu, and text display
		* also updates the cookie preference. 
		* 
		* Called after a user option change
		*/
		refreshDisplay: function() {
			// Update the configuration object
			$.cookie( 'TimedText.Preferences',  JSON.stringify( this.config ) );
			
			// Empty out previous text to force an interface update:
			this.prevText = [];
			
			// Refresh the Menu (if it has a target to refresh)
			if( this.menuTarget ) {
				mw.log('bind menu refresh display');
				this.bindMenu( this.menuTarget, false );
			}
			
			// Issues a "monitor" command to update the timed text for the new layout
			this.monitor();
		},

		/**
		* Builds the language source list menu
		* checks all text sources for kind and language key attribute
		*/
		getLanguageMenu: function() {
			var _this = this;

			// See if we have categories to worry about
			// associative array of SUB etc categories. Each kind contains an array of textSources.
			var catSourceList = {};
			var catSourceCount = 0;

			// ( All sources should have a kind (depreciate )
			var sourcesWithoutKind = [ ];
			for( var i=0; i < this.textSources.length; i++ ) {
				var source = this.textSources[ i ];
				if( source.kind ) {
					var kindKey = source.kind ;
					// Init Category menu item if it does not already exist:
					if( !catSourceList[ kindKey ] ) {
						// Set up catList pointer:
						catSourceList[ kindKey ] = [ ];
						catSourceCount++;
					}
					// Append to the source kind key menu item:
					catSourceList[ kindKey ].push(
						_this.getLiSource( source )
					);
				}else{
					sourcesWithoutKind.push( _this.getLiSource( source ) );
				}
			}
			var $langMenu = $('<ul>');
			// Check if we have multiple categories ( if not just list them under the parent menu item)
			if( catSourceCount > 1 ) {
				for(var kindKey in catSourceList) {
					var $catChildren = $('<ul>');
					for(var i=0; i < catSourceList[ kindKey ].length; i++) {
						$catChildren.append(
							catSourceList[ kindKey ][i]
						);
					}
					// Append a cat menu item for each kind list
					$langMenu.append(
						$.getLineItem( gM( 'mwe-timedtext-textcat-' + kindKey.toLowerCase() ) ).append(
							$catChildren
						)
					);
				}
			} else {
				for(var kindKey in catSourceList) {
					for(var i=0; i < catSourceList[ kindKey ].length; i++) {
						$langMenu.append(
							catSourceList[ kindKey ][i]
						);
					}
				}
			}

			for(var i=0; i < sourcesWithoutKind.length; i++) {
				$langMenu.append( sourcesWithoutKind[i] );
			}

			//Add in the "add text" to the end of the interface:
			if( mw.getConfig( 'TimedText.ShowAddTextLink' ) && _this.embedPlayer.apiTitleKey ){
				$langMenu.append(
					_this.getLiAddText()
				);
			}
			
			return $langMenu;
		},

		/**
		 * Updates a source display in the interface for a given time
		 * @param {Object} source Source to update
		 */
		updateSourceDisplay: function ( source, time ) {
			var _this = this;
			if( this.timeOffset ){
				time = time + parseInt( this.timeOffset );
			}
			
			// Get the source text for the requested time:
			var activeCaptions = source.getCaptionForTime( time );
			var addedCaption = false;
			// Show captions that are on: 
			$.each(activeCaptions, function( capId, caption){
				if( _this.embedPlayer.$interface.find( '.track[data-capId="' + capId +'"]').length == 0){
					_this.addCaption( source, capId, caption );
					addedCaption = true;
				}
			});
			
			// hide captions that are off: 
			_this.embedPlayer.$interface.find( '.track' ).each(function( inx, caption){
				if( !activeCaptions[ $( caption ).attr('data-capId') ] ){
					if( addedCaption ){
						$( caption ).remove();
					} else {
						$( caption ).fadeOut( mw.getConfig('EmbedPlayer.MonitorRate'), function(){ $(this).remove();} );
					}
				}
			});
		},
		getCaptionsTarget: function(){
			var $capTarget = this.embedPlayer.$interface.find('.captionsLayoutTarget');
			var layoutCss = {
				'left' : 0,
				'top' :0,
				'right':0,
				'position': 'absolute'
			};
			if( this.embedPlayer.controlBuilder.isOverlayControls() || 
				!mw.setConfig( 'EmbedPlayer.OverlayControls')  )
			{
				layoutCss['bottom'] = 0;				
			} else {
				layoutCss['bottom'] = this.embedPlayer.controlBuilder.getHeight();
			}
			
			if( $capTarget.length == 0 ){
				$capTarget = $( '<div />' )
				 	.addClass( 'captionsLayoutTarget' )
					.css( layoutCss )
					.appendTo( '#' + this.embedPlayer.id );
			}
			return $capTarget;
		},
		addCaption: function( source, capId, caption ){
			if( this.getLayoutMode() == 'off' ){
				return ;
			}
			// use capId as a class instead of id for easy selections and no conflicts with 
			// multiple players on page. 
			var $textTarget = $('<div />')
				.addClass( 'track' )
				.attr( 'data-capId', capId )
				.hide();
			
			// Update text ( use "html" instead of "text" so that subtitle format can
			// include html formating 
			// TOOD we should scrub this for non-formating html
			$textTarget.append( 
				$('<span />')
					.css( 'display','inline' )
					.html( caption.content )
			);


			// Add/update the lang option
			$textTarget.attr( 'lang', source.srclang.toLowerCase() );
			
			// Update any links to point to a new window
			$textTarget.find( 'a' ).attr( 'target', '_blank' );
			
			// Apply any custom style ( if we are ontop of the video )
			if( this.getLayoutMode() == 'ontop' ){
				if( caption.css ){
					$textTarget.css( caption.css );
				} else {
					$textTarget.css( this.getDefaultStyle() );
				}
				this.getCaptionsTarget().append( 
					$textTarget	
				);
			} else {
				// else apply the default layout system:
				this.addTextToDefaultLocation( $textTarget );
			}
			
			// Update the style of the text object if set
			if( caption.styleId ){
				var capCss = source.getStyleCssById( caption.styleId );
				$textTarget.find('span').css(
					capCss
				);
			}
		
			$textTarget.fadeIn('fast');
		},
		getDefaultStyle: function(){
			var baseCss =  {
					'position':'absolute',
					'bottom': 10,
					'width': '100%',
					'display': 'block',
					'opacity': .8,
					'text-align': 'center',
					'z-index': 2
				};
			baseCss =$.extend( baseCss, this.getInterfaceSizeTextCss({
				'width' :  this.embedPlayer.getWidth(),
				'height' : this.embedPlayer.getHeight()
			}));
			return baseCss;
		},
		/**
		 * Applies the default layout for a text target
		 */
		addTextBelowVideo: function( $textTarget ) {
			var $playerTarget = this.embedPlayer.$interface;
			// Get the relative positioned player class from the controlBuilder:
			this.embedPlayer.controlBuilder.keepControlBarOnScreen = true;
			// Set the belowBar size to 60 pixels:
			var belowBarHeight = 60;
			
			// Append before controls:
			$playerTarget.find( '.control-bar' ).before(
				$('<div>').addClass( 'captionContainer' )
					.css({
						'position' : 'absolute',
						'top' : this.embedPlayer.getHeight(),
						'display' : 'block',
						'width' : '100%',
						'height' : belowBarHeight + 'px',
						'background-color' : '#000',
						'text-align' : 'center',
						'padding-top' : '5px'
					} ).append(
						$textTarget.css( {
							'color':'white'
						} )
					)
			);
			
			// Add some height for the bar and interface
			var height = ( belowBarHeight + 8 ) + this.embedPlayer.getHeight() + this.embedPlayer.controlBuilder.getHeight();
			
			// Resize the interface for layoutMode == 'below' ( if not in full screen)
			if( ! this.embedPlayer.controlBuilder.fullscreenMode ){
				this.embedPlayer.$interface.animate({
					'height': height
				});
			}
			mw.log( 'TimedText:: height of ' + this.embedPlayer.id + ' is now: ' + $( '#' + this.embedPlayer.id ).height() );
		}
	};

	
} )( window.mediaWiki, window.jQuery );
